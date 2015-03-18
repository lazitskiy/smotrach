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

        }
    }

    app.controllers.filmController = filmController;

    return app;
}