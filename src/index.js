'use strict';

const Promise = require('bluebird');

const _ = require('lodash');
const constants = require('./constants');
const killEmAll = require('./kill-em-all');
const Sonos = Promise.promisifyAll(require('node-sonos'));
const pinStatus = 'in';
const Table = require('cli-table');


let columnWidth = 80;

if (process.stdout.isTTY) {
    columnWidth = process.stdout.columns;
    process.stdout.on('resize', () => {
        columnWidth = process.stdout.columns;
    });
}


let search;

async function deviceAvailable(device) {

    try {
        console.log(`A device has been found: ${device.host}:${device.port}`);

        let state;
        try {
            state = await device.getCurrentStateAsync();

            if (state === 'stopped') {
                console.log('Sonos is in the stopped state');

                return;
            } else if (state !== 'playing') {
                console.error('Unknown state');

                return;
            }
        } catch (err) {
            state = `Unknown (An error occured) - ${JSON.stringify(err)}.`;
        }

        let currentTrack;
        try {
            currentTrack = await device.currentTrackAsync();
        } catch (err) {
            console.log(`Couldn't get the current track: ${err.message}`);
        }

        try {
            await new Promise((resolve, reject) => {
                device.getQueue((err, queue) => {

                    if (err) {
                        return reject(err);
                    }

                    console.log(JSON.stringify(queue));

                    return checkQueue(device, queue)
                        .then(resolve)
                        .catch(reject);
                });
            });
        } catch (err) {
            console.error(`Couldn't get the Queue: ${err.message}`);
        }

        if (currentTrack) {

            const currentPosition = currentTrack.position && currentTrack.duration
                ? ` (${Math.round(currentTrack.position / currentTrack.duration * 100)})`
                : '';

            console.log(`Currently playing track is: ${currentTrack.title}, ${currentTrack.artist}${currentPosition}`);
            if (constants.blacklist.some(artist => currentTrack.artist === artist)) {
                console.log('Currently playing blacklisted artist');
                await new Promise((resolve, reject) => {
                    device.next((err, nexted) => {

                        if (err) {
                            return reject(new Error(`Could not reject: ${err.message}`));
                        }

                        if (!nexted) {
                            return reject(new Error('Could not reject: no nexted'));
                        }

                        return resolve();
                    });
                });
                console.log('Skipped track by blacklisted artist');
            }
        }

    } catch (err) {

        handleError('getCurrentState', err);
    }
}

async function checkQueue(device, queue) {

    console.log('\n** QUEUE **\n');

    const queueTable = new Table({
        'colWidths': [4, Math.floor(columnWidth / 2) - 10, Math.floor(columnWidth / 2) - 10],
        'head': ['#', 'Title', 'Artist'],
    });

    let index = 0;
    queueTable.push(...queue.items.map((track) => {

        index += 1;

        return [index, track.title, track.artist];
    }));

    console.log(queueTable.toString());

    const blacklisted = _(queue.items)
                        .map(track => track.artist)
                        .uniq()
                        .intersection(constants.blacklist)
                        .value();

    if (!blacklisted.length) {

        console.log('\nAll good');

        return;
    }

    const blacklistedTable = new Table({
        'colWidths': [4, Math.floor(columnWidth) - 10],
        'head': ['#', 'Artist'],
    });

    index = 0;
    blacklistedTable.push(...blacklisted.map((artist) => {

        index += 1;

        return [index, artist];
    }));

    console.log(blacklistedTable.toString());

    if (pinStatus !== 'out') {
        console.log('\nThe pin is in. Not going to fire yet');

        return;
    }

    killEmAll();
    await device.flushAsync()
        .then(() => {

            console.log('Nuke queue done!');
        })
        .catch((err) => {

            console.error('device.flush done but with an error', err);
        });
}

function runSearch() {

    if (search) {
        search.destroy();
    }

    console.log('Searching for Sonos devices...');
    console.log('Doing a search');

    return new Promise((resolve, reject) => {

        const search = Sonos.search(device => deviceAvailable(device)
            .then(resolve)
            .catch(reject)
        );

        search.on('error', err => reject(err));
    });
}

function handleError(errorType, err) {

    console.error(`${errorType} Error`, err);
    process.exit(1);
}

setImmediate(runSearch, 5000);
setInterval(runSearch, 5000);
