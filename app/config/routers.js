/**
 * Created by vaso on 15.03.15.
 */
module.exports = function (App, Marionette) {
    'use strict';
    new Backbone.Marionette.AppRouter({
        controller: App.Controllers.IndexController,
        appRoutes: {
            '': 'index'
        }
    })
}