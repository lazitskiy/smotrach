/**
 * Created by vas on 18.03.2015.
 */

module.exports = function (app) {
    'use strict';

    var indexController = {
        index: function () {

            app.models.filmModel.getFilmsOnPage().then(function (films) {
                var view = new app.views.indexIndexVeiw({
                    films: films
                });
                view.preRender().then(function () {
                    view.render();
                    app.content.show(view);
                })
            });

        }
    };

    app.controllers.indexController = app._.extend(indexController, app.controllers.baseController);

    return app;
}