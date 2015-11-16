module.exports = function(config) {
  return {
    dev: {
      bsFiles: {
        src: ['<%= srcDir %>/css/*.css', '<%= srcDir %>/*.html'],
      },
      options: {
        watchTask: true,
        server: config.srcDir,
      }
    }
  }
};