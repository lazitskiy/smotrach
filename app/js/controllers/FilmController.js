/**
 * Created by vas on 18.03.2015.
 */
module.exports = function (app) {
    'use strict';

    var filmController = {
        index: function () {

            app.models.filmModel.providerFilmGet().then(function (films) {
                console.log(JSON.parse(films).data.movies[0]);
            })

        },

        filmDetail: function (film_id) {

           /* app.httpRequest.request('http://yts.to/torrent/download/4F9AC838FD94BC4529E3F9025356FED90EC2280F.torrent')
                .then(function (data) {
                    console.debug(data);
                });*/

            film_id = parseInt(film_id);
            app.models.filmModel.findOne({id: film_id})
                .then(function (film) {
                    var view = new app.views.filmDetailVeiw({
                        film: film
                    });
                    view.preRender().then(function () {
                        view.render();
                        app.content.show(view);
                    })
                });


        }
    }

    app.controllers.filmController = filmController;

    return app;
}