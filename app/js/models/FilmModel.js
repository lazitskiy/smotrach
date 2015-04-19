/**
 * Created by vaso on 17.03.15.
 */
/**
 * Created by vaso on 17.03.15.
 */
module.exports = function (app, q) {
    'use strict';

    var filmModel = app.models.baseModel.extend({}, {
        nedbStore: 'film.db',

        providerFilmGet: function () {
            var deferred = q.defer();
            app.httpRequest.request('http://smotrach.loc/api/v4/movies/list').then(function (data) {
                deferred.resolve(data);
            });
            return deferred.promise;
        },

        getFilmsOnPage: function (options) {
            return app.models.setting.get('film_last_load').then(function (setting) {
                var last_upload = setting.value;

                // Кеш еще есть?
                if (new Date() - last_upload < app.settings.intervalFilmUpload) {
                    console.log('load films from DB');
                    return app.models.filmModel.findAll().then(function (data) {
                        return data;
                    });
                }

                console.log('load films from provider');
                return app.models.filmModel.providerFilmGet().then(function (data) {

                    var parsed = JSON.parse(data).data.movies;
                    return app._.map(parsed, function (film, key, list) {
                        return {
                            id: film.id,
                            poster: film.poster,
                            title: film.name_ru,
                            year: film.year,
                            rating_int: film.rating_int
                        };
                    });

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
            }).fail(function (error) {
                console.error("error occured: " + error);
            });
        }


    });

    app.models.filmModel = filmModel;

    return app;
}