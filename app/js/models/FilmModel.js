/**
 * Created by vaso on 17.03.15.
 */
/**
 * Created by vaso on 17.03.15.
 */
module.exports = function (app, q) {
    'use strict';

    var filmModel = app.models.baseModel.extend({}, {
        store: 'film',

        providerFilmGet: function () {
            var deferred = q.defer();
            app.httpRequest.request('http://yts.re/api/v2/list_movies.json').then(function (data) {
                deferred.resolve(data);
            });
            return deferred.promise;
        }
    });

    app.models.filmModel = filmModel;

    return app;
}