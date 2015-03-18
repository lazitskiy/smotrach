/**
 * Created by vas on 18.03.2015.
 */
module.exports = function (app) {
    'use strict';

    var indexController = {
        index: function () {

            app.models.filmModel.providerFilmGet().then(function (films) {
                return JSON.parse(films).data.movies;
            }).then(function (films) {
                var view = new app.views.indexIndexVeiw({
                    films: films
                });
                return view.preRender().then(function () {
                    view.render();
                    app.content.show(view);
                })
            }).fail(function (error) {
                console.log("error occured: " + error);
            });
        }
    }

    app.controllers.indexController = indexController;

    return app;
}