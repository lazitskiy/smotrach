/**
 * Created by vaso on 17.03.15.
 */
path = require('path');
module.exports = function (app, q, Backbone, settings, nedb) {
    'use strict';

    var baseModel = Backbone.Model.extend({}, {

        connection: [],

        dataStore: function () {
            if ((this.connection[this.nedbStore] !== undefined) && (this.connection[this.nedbStore] !== null)) {
                return this.connection[this.nedbStore];
            }
            this.connection[this.nedbStore] = new nedb({
                filename: path.join(settings.databaseLocation, this.nedbStore),
                autoload: true
            });
            return this.connection[this.nedbStore];
        },

        insert: function (objects) {
            var deferred = q.defer();
            this.dataStore().insert(objects, function (err) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            });
            return deferred.promise;
        },

        removeAll: function (options) {
            var deferred = q.defer();
            this.dataStore().remove({}, {multi: true}, function (err, numRemoved) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            });
            return deferred.promise;
        },

        findAll: function () {
            var deferred = q.defer();
            this.dataStore().find({}, function (err, object) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(object);
                }
            });
            return deferred.promise;
        },
        findOne: function (criteria) {
            var deferred = q.defer();


            this.dataStore().findOne(criteria, function (err, object) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(object);
                }
            });
            return deferred.promise;
        }
    });

    app.models.baseModel = baseModel;

    return app;
}