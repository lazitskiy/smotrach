/**
 * Created by vaso on 18.03.15.
 */
module.exports = function (app, q, Backbone, settings, $) {
    'use strict';

    var base = Backbone.Marionette.ItemView.extend({
        preRender: function () {

            var defer = q.defer();

            var content = app.getRegion('content');
            // Очистим ебаный регион
            content.$el.empty();

            // А потом динамически запихаем новый
            var template_content = settings.viewPath + this.tpl_path + '.' + settings.templateExtension;
            var template_name = this.template.substr(1);

            $.get(template_content, function (res) {
                content.$el.append('<script id="' + template_name + '" type="template">' + res + '</script>');
                return defer.resolve();
            });

            return defer.promise;
        }

    });

    app.views.baseView = base;
    return app;
}