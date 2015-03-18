/**
 * Created by vas on 18.03.2015.
 */
module.exports = function (app) {
    'use strict';

    var filmController = {
        index: function () {
            console.debug('film/index');

            app.models.filmModel.providerFilmGet().then(function (films) {
                console.debug(films);

            })

        }
    }

    app.controllers.filmController = filmController;

    return app;
}