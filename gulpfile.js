var browserify = require('browserify');
var watchify = require('watchify');
var gulp = require('gulp');
var source = require('vinyl-source-stream');

var sourceFile = './app/app.js';
var destFolder = './app/build';
var destFile = 'bundle.js';


gulp.task('browserify', function () {
    return browserify(sourceFile, {debug: true})
        .bundle()
        .pipe(source(destFile))
        .pipe(gulp.dest(destFolder));
});

gulp.task('watch', function () {
    var bundler = watchify(browserify(
        sourceFile, {
            cache: {},
            debug: true
        }
    ));
    bundler.on('update', rebundle);

    function rebundle() {
        console.log('rebuild');
        return bundler.bundle()
            .pipe(source(destFile))
            .pipe(gulp.dest(destFolder));
    }

    return rebundle();
});

gulp.task('default', ['browserify', 'watch']);