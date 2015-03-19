/**
 * Created by vas on 19.03.2015.
 */
module.exports = function (app, q) {
    'use strict';

    var settingModel = app.models.baseModel.extend({}, {
        nedbStore: 'setting.db',

        update: function (options) {
            var deferred = q.defer();
            this.dataStore().update({key: options.key}, {$set: {value: options.value}}, {}, function (err) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            });
            return deferred.promise;
        },

        get: function (attr) {
            var db = this.dataStore();
            var deferred = q.defer();

            db.findOne({key: attr}, function (err, object) {
                if (!object) {
                    db.insert({
                        key: attr,
                        value: ''
                    }, function (err, newSetting) {
                        deferred.resolve(newSetting);
                    });
                } else {
                    deferred.resolve(object);
                }

            });
            return deferred.promise;
        },

        set: function (options) {
            var db = this.dataStore();
            var deferred = q.defer();

            db.insert({
                key: options.key,
                value: options.value
            }, function (err, key) {
                if (!key) {
                    deferred.reject('setting ' + key + ' not set');
                } else {
                    deferred.resolve(key);
                }
            });
            return deferred.promise;
        },

        providerFilmGet: function () {

            var deferred = q.defer();
            app.httpRequest.request('http://yts.re/api/v2/list_movies.json').then(function (data) {
                deferred.resolve(data);
            });
            return deferred.promise;
        }
    });

    app.models.setting = settingModel;

    return app;
}