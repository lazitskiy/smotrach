/**
 * Created by vas on 18.03.2015.
 */

module.exports = function (app) {
    'use strict';

    var indexController = {
        index: function () {
            app.models.setting.get('film_last_load').then(function (setting) {
                var last_upload = setting.value;

                if (new Date() - last_upload > app.settings.intervalFilmUpload) {
                    console.log('load films from provider');
                    var films = app.models.filmModel.providerFilmGet().then(function (data) {
                        var parsed = JSON.parse(data).data.movies;
                        var films = app._.map(parsed, function (film, key, list) {
                            return {
                                id: film.id,
                                genres: film.genres,
                                medium_cover_image: film.medium_cover_image,
                                title: film.title,
                                year: film.year,
                                rating: film.rating
                            };
                        });
                        return films;
                    }).then(function (films) {
                        app.models.setting.update({
                            key: 'film_last_load',
                            value: new Date()
                        });
                        return films;
                    }).then(function (films) {
                        app.models.filmModel.removeAll().then(function () {
                            app.models.filmModel.insert(films);
                        });

                        return films;
                    });

                    return films;
                } else {
                    console.log('load films from DB');
                    return app.models.filmModel.findAll().then(function (data) {
                        return data;
                    });
                }

            }).then(function (films) {

                var view = new app.views.indexIndexVeiw({
                    films: films
                });
                view.preRender().then(function () {
                    view.render();
                    app.content.show(view);
                })

            }).fail(function (error) {
                console.log("error occured: " + error);
            });

        }
    };

    app.controllers.indexController = app._.extend(indexController, app.controllers.baseController);

    return app;
}