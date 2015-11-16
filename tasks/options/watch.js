module.exports = function(config) {
  return {
    less: {
      files: '<%= srcDir %>/less/**/*.less',
      tasks: ['less:src']
    }
  }
}