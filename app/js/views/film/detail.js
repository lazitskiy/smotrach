/**
 * Created by vas on 18.03.2015.
 */
var http = require('http');

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

        // Alias fo common/player::
        launchPlayer: function (e) {
            e.preventDefault();
            var torrent_url = e.target.href;
            var _this = this;

            app.streamer.init(torrent_url);

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