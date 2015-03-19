/**
 * Created by vas on 18.03.2015.
 */
module.exports = function (app) {
    'use strict';

    var baseController = {
        /**
         * Проверим время последней загрузки фильмов.
         * @param options
         */
        checkDownloaded: function (options) {
            alert(123);
        }
    }

    app.controllers.baseController = baseController;

    return app;
}
