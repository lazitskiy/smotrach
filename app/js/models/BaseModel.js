/**
 * Created by vaso on 17.03.15.
 */
path = require('path');
module.exports = function (app, q, Backbone, settings, nedb) {
    'use strict';

    var baseModel = Backbone.Model.extend({}, {
        dataStore: function () {
            return new nedb({
                filename: path.join(settings.databaseLocation, this.store),
                autoload: true
            });
        },


        findAll: function (criteria) {
            this.dataStore();
        }
    });

    app.models.baseModel = baseModel;

    return app;
}