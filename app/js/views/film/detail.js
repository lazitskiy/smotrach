/**
 * Created by vas on 18.03.2015.
 */

module.exports = function (app) {
    'use strict';

    var filmDetailVeiw = app.views.baseView.extend({
        tpl_path: 'film/detail',
        template: '#film-detail',

        serializeData: function () {
            return {
                film: this.options.film
            }
        }

    });


    app.views.filmDetailVeiw = filmDetailVeiw;
    return app;
}