/**
 * Created by vas on 18.03.2015.
 */

module.exports = function (app, Marionette) {

    new Marionette.AppRouter({
        controller: app.controllers.indexController,
        appRoutes: {
            '': 'index'
        }
    });

    new Marionette.AppRouter({
        controller: app.controllers.filmController,
        appRoutes: {
            'film': 'index',
            'film/:film_id': 'filmDetail'
        }
    });
}
