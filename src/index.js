'use strict';

const Promise = require('bluebird');

const _ = require('lodash');
const constants = require('./constants');
const killEmAll = require('./kill-em-all');
const Sonos = Promise.promisifyAll(require('node-sonos'));


let search;

async function checkQueue(device, err, queue) {

    if (err) {
        handleError('getQueue', err);
    }

    console.log('\n** QUEUE **\n');
    _.each(queue.items, t => console.log(`Title:  ${t.title}\nArtist: ${t.artist}`));

    const blacklisted = _(queue.items)
                        .map(track => track.artist)
                        .uniq()
                        .intersection(constants.blacklist)
                        .value();

    if (!blacklisted.length) {
        console.log('\nAll good');
        return;
    }

    killEmAll();
    device.flush((err) => {
        if (err) {
            console.error('device.flush done but with an error');
        } else {
            console.log('Nuke queue done!');
        }
    });
}

async function deviceAvailable(device) {

    console.log(`A device has been found: ${device.host}:${device.port}`);

    try {
        const state = await device.getCurrentStateAsync();

        if (state === 'stopped') {
            console.log('Sonos is in the stopped state');
            return;
        }

        return await device.getQueueAsync(() => checkQueue(device));

    } catch (err) {

        handleError('getCurrentState', err);
    }
}

function runSearch() {

    if (search) {
        search.destroy();
    }

    console.log('Searching for Sonos devices...');
    console.log('Doing a search');

    search = Sonos.search();

    search.on('error', handleError.bind(null, 'Search'));

    search.on('DeviceAvailable', deviceAvailable);
}

function handleError(errorType, err) {

    console.error(`${errorType} Error`, err);
    process.exit(1);
}

setImmediate(runSearch, 5000);
setInterval(runSearch, 5000);
