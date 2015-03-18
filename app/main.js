var dataPath = '/Users/vaso/htdocs/node/4.smotrach/app/';


var WebTorrent = require('webtorrent');
var fs = require('fs');

var client = new WebTorrent();
var torrentFile = dataPath + 'tor/forever.torrent';

client.add(torrentFile, {
    tmp: dataPath + 'tor/tmp'
}, function (torrent) {

    // Got torrent metadata!
    console.log('Torrent info hash:', torrent.infoHash);
    console.log('Magnet:', torrent.magnetURI);

    setInterval(refreshStatus, 1000, torrent);


    /*    torrent.files.forEach(function (file) {
     // Stream each file to the disk
     var source = file.createReadStream()
     var destination = fs.createWriteStream(dataPath + 'tor/' + file.name);
     console.log(file.name)
     source.pipe(destination)
     })*/
});

function refreshStatus(torrent) {

    var torrentName = torrent.name;
    var size = Math.round(torrent.length / 1024 / 1024);
    var downloaded = Math.round(torrent.downloaded / 1024 / 1024);
    var progress = Number(Math.round(torrent.progress * 100 + 'e2') + 'e-2');
    var timeRemainig = Number(Math.round(torrent.timeRemaining / 1000 / 60 + 'e2') + 'e-2');

    $('#torrent-name').html(torrentName);
    $('#size').html(size);
    $('#downloaded').html(downloaded);
    $('#progress').html(progress);
    $('#timeRemainig').html(timeRemainig);
    //alert(1);
}



