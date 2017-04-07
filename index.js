const Promise = require('bluebird').Promise;

const _ = require('lodash');
const assert = require('assert');
const constants = require('./constants');
const killEmAll = require('./kill-em-all');
const Sonos = Promise.promisifyAll(require('node-sonos'));
console.log('Searching for Sonos devices...');


let search;

function checkQueue(device, err, resp) {

    if (err) {
        handleError('getQueue', err);
    }

    console.log('\n** QUEUE **\n');
    _.each(resp.items, t => console.log(`Title:  ${t.title}\nArtist: ${t.artist}`));

    const blacklisted = _(resp.items)
                        .map(t => t.artist)
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

function deviceAvailable(device, model) {

    console.log(`A device has been found: ${device.host}:${device.port}`);

    device.getCurrentState(function (err, state) {

        if (err) {
            handleError('getCurrentState', err);
        }

        if (state === 'stopped') {
            console.log('Sonos is in the stopped state');
        } else {
            device.getQueue(checkQueue.bind(this, device));
        }
    });
}

function runSearch() {

    if (search) {
        search.destroy();
    }

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
const myInterval = setInterval(runSearch, 5000);
