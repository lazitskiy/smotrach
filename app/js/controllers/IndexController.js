/**
 * Created by vas on 18.03.2015.
 */
module.exports = function (app) {
    'use strict';

    var indexController = {
        index: function () {
            console.log('index/index');
        }
    }

    app.controllers.indexController = indexController;

    return app;
}