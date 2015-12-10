define([
  'angular',
  'app',
  'lodash'
],
function (angular, app, _) {
  'use strict';

  angular
    .module('kibana.directives')
    .directive('panelThumb', function($compile) {
      return {
        link: function($scope, elem) {

          $scope.$on("$destroy",function() {
            elem.remove();
          });

          if (!_.isUndefined($scope.panelType)) {
            $scope.require(['panels/'+$scope.panelType+'/module'], function () {
              var template = '<div ng-controller="'+$scope.panelType+'" ng-include="\'app/partials/panelthumb.html\'"></div>';
              elem.html($compile(angular.element(template))($scope));
            });
          };

        }
      };
    });
});
