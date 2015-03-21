/**
 * Created by vaso on 20.03.15.
 */

var peerflix = require('peerflix');
var path = require('path');
var readTorrent = require('read-torrent');


module.exports = function (app) {
    'use strict';

    var streamer = {
        numConnections: 100,

        engine: null,

        startPlayer: function () {

            app.$('<video controls="" autoplay="" name="media"><source src="' + url + '" type="video/mp4"></video>').appendTo('#player');

        },

        checkIsReadyForPay: function (streamer) {
            var state = 'connecting';
            var _this = streamer;

            var swarm = _this.engine.swarm;
            if (swarm.downloaded > app.MIN_SIZE_LOADED || (swarm.piecesGot * (_this.engine.torrent !== null ? _this.engine.torrent.pieceLength : 0)) > app.MIN_SIZE_LOADED) {
                state = 'ready';
            } else if (swarm.downloaded || swarm.piecesGot > 0) {
                state = 'downloading';
            } else if (swarm.wires.length) {
                state = 'startingDownload';
            }

            console.log(state);
            if (state == 'ready') {
                _this.startPlayer();
            } else {
                app._.delay(_this.checkIsReadyForPay, 1000, _this);
            }
        },

        init: function (torrent_url) {
            var _this = this;

            readTorrent(torrent_url, function (err, torrent) {
                if (err) {
                    console.log("error occured: " + err);
                }

                var tmpFile = path.join(app.settings.tmpLocation, 'hui');

                var engine = peerflix(torrent, {
                    connections: _this.numConnections || 100, // Max amount of peers to be connected to.
                    port: 0, // auto
                    tmp: app.settings.tmpLocation,
                    path: tmpFile,
                    buffer: (1.5 * 1024 * 1024).toString() // create a buffer on torrent-stream

                });
                engine.swarm.piecesGot = 0;
                engine.on('verify', function (index) {
                    engine.swarm.piecesGot += 1;
                });

                engine.server.on('listening', function () {
                    var url = 'http://127.0.0.1:' + engine.server.address().port + '/';
                    console.log('start streaming at: ' + url);
                    _this.engine = engine;
                    _this.checkIsReadyForPay(_this);
                });
            });
        },

        destroy: function () {
            this.engine.remove();
            this.engine.destroy();
            this.engine = null;
        }

    }

    app.streamer = streamer;
    return app;
}