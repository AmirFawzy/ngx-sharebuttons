/**
 * @Author: @MurhafSousli
 */

const gulp = require('gulp');

/** To log like console.log().. */
var gutil = require('gulp-util');

/** del to remove dist directory */
const del = require('del');

/** load templates and styles in ng2 components */
var embedTemplates = require('gulp-inline-ng2-template');

/** TSLint checker */
const tslint = require('gulp-tslint');

/** Sass style */
const postcss = require('gulp-postcss');
const sass = require('gulp-sass');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const scss = require('postcss-scss');
const stripInlineComments = require('postcss-strip-inline-comments');

/** External command runner */
const exec = require('child_process').exec;

/**OS Access */
const os = require('os');

/** File Access */
const fs = require('fs');
const file = require('gulp-file');
const path = require('path');

/** To properly handle pipes on error */
const pump = require('pump');

/** To upload code coverage to coveralls */
const coveralls = require('gulp-coveralls');

const LIBRARY_NAME = 'ng2-sharebuttons';

const config = {
    allSass: 'src/**/*.scss',
    allTs: 'src/**/*.ts',
    allTsd: 'typings/index.d.ts',
    outputDir: 'dist/',
    coverageDir: 'coverage/'
};


//Helper functions
function platformPath(path) {
    return /^win/.test(os.platform()) ? `${path}.cmd` : path;
}

function startKarmaServer(isTddMode, done) {
    var karmaServer = require('karma').Server;
    var travis = process.env.TRAVIS;

    var config = { configFile: `${__dirname}/karma.conf.js`, singleRun: !isTddMode, autoWatch: isTddMode };

    if (travis) {
        config['browsers'] = ['Chrome_travis_ci']; // 'Chrome_travis_ci' is defined in "customLaunchers" section of config/karma.conf.js
    }

    new karmaServer(config, done).start();
}

// Clean Tasks
gulp.task('clean:dist', () => {
    return del(config.outputDir);
});

gulp.task('clean:coverage', () => {
    return del(config.coverageDir);
});

// Compile Sass to css
gulp.task('styles', (cb) => {
    /**
     * Remove comments, autoprefixer, Minifier
     */
    var processors = [
        stripInlineComments,
        autoprefixer,
        cssnano
    ];
    pump([
        gulp.src(config.allSass),
        sass().on('error', sass.logError),
        postcss(processors, { syntax: scss }),
        gulp.dest('src')
    ], cb);
});

// TsLint the source files
gulp.task('ts-lint', (cb) => {
    pump([
        gulp.src(config.allTs),
        tslint({ formatter: "verbose" }),
        tslint.report()
    ], cb);
});

// Inline templates and styles in ng2 components
gulp.task('inline-templates', ['clean:dist', 'styles', 'ts-lint'], (cb) => {
    var defaults = {
        base: '/src',
        target: 'es5',
        useRelativePaths: true
    };
    pump(
        [
            gulp.src(config.allTs),
            embedTemplates(defaults),
            gulp.dest(`${config.outputDir}/inlined`)
        ],
        cb);
});

// Compile inlined TS files with Angular Compiler (ngc)
gulp.task('ngc', ['inline-templates'], (cb) => {
    var executable = path.join(__dirname, platformPath('/node_modules/.bin/ngc'));
    exec(`${executable} -p ./tsconfig-aot.json`, (err) => {
        if (err) return cb(err); // return error
        del(`${config.outputDir}/waste`);//delete useless *.ngfactory.ts files( will be regenerated by consumer)
        del(`${config.outputDir}/inlined`); //delete temporary *.ts files with inlined templates and styles 
        cb();
    }).stdout.on('data', (data) => console.log(data));
});

// Clean, Lint, Test, Sass to css, Inline templates & Styles and Compile
gulp.task('compile-ts', ['clean:dist', 'ts-lint', 'styles', 'ngc']);


// Testing Tasks
gulp.task('test', ['clean:coverage', 'compile-ts'], (cb) => {
    const ENV = process.env.NODE_ENV = process.env.ENV = 'test';
    startKarmaServer(false, cb);
});

gulp.task('watch', () => {
    gulp.watch([config.allTs], ['compile-ts']);
    gulp.watch([config.allSass], ['styles']);
});

gulp.task('test:watch', (cb) => {
    const ENV = process.env.NODE_ENV = process.env.ENV = 'test';
    startKarmaServer(true, cb);
});

// Prepare 'dist' folder publication to NPM
gulp.task('npm', ['compile-ts', 'test'], (cb) => {
    var pkgJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    var targetPkgJson = {};
    var fieldsToCopy = ['version', 'description', 'keywords', 'author', 'repository', 'license', 'bugs', 'homepage'];

    targetPkgJson['name'] = LIBRARY_NAME;

    //only copy needed properties from project's package json
    fieldsToCopy.forEach((field) => { targetPkgJson[field] = pkgJson[field]; });

    targetPkgJson['main'] = `index.js`;
    targetPkgJson['module'] = 'index.js';
    targetPkgJson['typings'] = 'index.d.ts';

    // defines project's dependencies as 'peerDependencies' for final users
    targetPkgJson.peerDependencies = {};
    Object.keys(pkgJson.dependencies).forEach((dependency) => {
        targetPkgJson.peerDependencies[dependency] = `^${pkgJson.dependencies[dependency]}`;
    });

    // copy the needed additional files in the 'dist' folder
    pump(
        [
            gulp.src(['README.md', 'LICENSE', 'CHANGELOG.md']),
            file('package.json', JSON.stringify(targetPkgJson, null, 2)),
            gulp.dest(config.outputDir)
        ],
        cb);
});

// Publish 'dist' folder to NPM
gulp.task('publish', ['npm'], (done) => {
    // run npm publish terminal command to publish the 'dist' folder only
    exec(`npm publish ${config.outputDir}`,
        (error, stdout, stderr) => {
            if (stderr) {
                gutil.log(gutil.colors.red(stderr));
            } else if (stdout) {
                gutil.log(gutil.colors.green(stdout));
            }
            // execute callback when its done 
            if (done) {
                done();
            }
        }
    );
});

// Just build the 'dist' folder (without publishing it to NPM)
gulp.task('build', ['npm']);

// Upload code coverage report to coveralls.io (will be triggered by Travis CI on successful build)
gulp.task('coveralls', () => {
    return gulp.src(`${config.coverageDir}/coverage.lcov`)
        .pipe(coveralls());
});

gulp.task('default', ['build']);
