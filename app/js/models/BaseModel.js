/**
 * Created by vaso on 17.03.15.
 */
path = require('path');
module.exports = function (App, Backbone, Nedb, Q, Settings) {
    'use strict';

    var BaseModel = Backbone.Model.extend({}, {
        dataStore: function () {
            return new Nedb({
                filename: path.join(Settings.databaseLocation, this.store),
                autoload: true
            });
        },


        findAll: function (criteria) {
            this.dataStore();
        }
    });

    App.Models.BaseModel = BaseModel;

    return App;
}