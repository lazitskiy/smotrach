/**
 * Created by vaso on 13.03.15.
 */

module.exports = function (app) {
    'use strict';

    var indexIndexVeiw = app.views.baseView.extend({
        tpl_path: 'index/index',
        template: '#index-index',

        serializeData: function () {
            return {
                films: this.options.films
            }
        }

    });


    app.views.indexIndexVeiw = indexIndexVeiw;
    return app;
}