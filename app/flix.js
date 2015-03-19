/**
 * Created by vaso on 20.03.15.
 */

var numConnections = 100;

// Start Popcornflix (Peerflix)
var popcornflix = require('peerflix');
var fs = require('fs');

torrent = '/Users/vaso/htdocs/node/4.smotrach/app/tor/hui.torrent';
tmpFile = '/Users/vaso/htdocs/node/4.smotrach/app/tor/tmp/hui.mp4';

var torrent = fs.readFileSync(torrent);


videoStreamer = popcornflix(torrent, {
    // Set the custom temp file
    path: tmpFile,
    port: 0,
    buffer: (1.5 * 1024 * 1024).toString(),
    connections: numConnections
});

videoStreamer.server.on('listening', function () {
    var url = 'http://127.0.0.1:' + videoStreamer.server.address().port + '/';
    console.debug(url);


    setTimeout(function () {
        var element = $('<video/>', {
            id: 'foo',
            src: url,
            type: 'video/mp4',
            autoplay: 'autoplay',
            controls: 'controls'
        }).appendTo('body');
    }, 5000)


});
