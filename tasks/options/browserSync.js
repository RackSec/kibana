module.exports = function(config) {
  return {
    dev: {
      bsFiles: {
        src: ['<%= srcDir %>/css/*.css', '<%= srcDir %>/**/*.html', '<%= srcDir %>/**/*.js'],
      },
      options: {
        watchTask: true,
        server: config.srcDir,
      }
    }
  }
};