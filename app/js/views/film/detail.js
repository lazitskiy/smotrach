/**
 * Created by vas on 18.03.2015.
 */

module.exports = function (app) {
    'use strict';

    var filmDetailVeiw = app.views.baseView.extend({
        tpl_path: 'film/detail',
        template: '#film-detail',

        serializeData: function () {
            return {
                film: this.options.film
            }
        },

        ui: {
            link: '.torrent_link'
        },
        events: {
            'click @ui.link': 'launchPlayer'
        },

        launchPlayer: function (e) {
            e.preventDefault();
            var torrent_url = e.target.href;

            //    app.httpRequest.request(torrent_url)
            //    .then(function (torrent_buffer) {
            var _this = this;

            var client = new app.webtorrent();
            client.add(torrent_url, {tmp: '/Users/vaso/htdocs/node/4.smotrach/app/tor/tmp'}, function (torrent) {
                // Got torrent metadata!
                console.log('Torrent info hash:', torrent.infoHash);
                console.log('Magnet:', torrent.magnetURI);

                var arr_torrents = app._.filter(torrent.files, function (el, k) {
                    return el.name.endsWith('.mp4') || el.name.endsWith('.avi') || el.name.endsWith('.mkv');
                })


                setInterval(_this.refreshStatus, 1000, torrent);

                // Let's say the first file is a webm (vp8) or mp4 (h264) video...
                var file = torrent.files[0];
                // Create a video element
                var video = app.$('video');
                video.attr('controls', true);

                // Stream the video into the video tag
                file.createReadStream().pipe(video)

            })
            // });

        },
        refreshStatus: function (torrent) {
            var torrentName = torrent.name;
            var size = Math.round(torrent.length / 1024 / 1024);
            var downloaded = Math.round(torrent.downloaded / 1024 / 1024);
            var progress = Number(Math.round(torrent.progress * 100 + 'e2') + 'e-2');
            var timeRemainig = Number(Math.round(torrent.timeRemaining / 1000 / 60 + 'e2') + 'e-2');

            app.$('#torrent-name').html(torrentName);
            app.$('#size').html(size);
            app.$('#downloaded').html(downloaded);
            app.$('#progress').html(progress);
            app.$('#timeRemainig').html(timeRemainig);
        }


    });


    app.views.filmDetailVeiw = filmDetailVeiw;
    return app;
}