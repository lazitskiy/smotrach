/**
 * Created by vaso on 17.03.15.
 */
/**
 * Created by vaso on 17.03.15.
 */
module.exports = function (App) {
    'use strict';

    var FilmModel = App.Models.BaseModel.extend({}, {
        store: 'film'
    });

    App.Models.FilmModel = FilmModel;

    return App;
}