/** @scratch /panels/5
 *
 * include::panels/alertmap.asciidoc[]
 */

/** @scratch /panels/alertmap/0
 *
 * == Alertmap
 * Status: *Experimental*
 *
 * Alertmap is called alertmap for lack of a better name. Alertmap uses geographic coordinates to
 * create clusters of markers on map and shade them orange, yellow and green depending on the
 * density of the cluster.
 *
 * To drill down, click on a cluster. The map will be zoomed and the cluster broken into smaller cluster.
 * When it no longer makes visual sense to cluster, individual markers will be displayed. Hover over
 * a marker to see the tooltip value/
 *
 * IMPORTANT: alertmap requires an internet connection to download its map panels.
 */
define([
  'angular',
  'app',
  'lodash',
  './leaflet/leaflet-src',
  'require',

  'css!./module.css',
  'css!./leaflet/leaflet.css',
  'css!./leaflet/plugins.css'
],
function (angular, app, _, L, localRequire) {
  'use strict';

  var module = angular.module('kibana.panels.alertmap', []);
  app.useModule(module);

  module.controller('alertmap', function($scope, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {
      editorTabs : [
        {
          title: 'Queries',
          src: 'app/partials/querySelect.html'
        }
      ],
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      status  : "Experimental",
      description : "Displays geo points in clustered groups on a map. The caveat for this panel is"+
        " that, for better or worse, it does NOT use the terms facet and it <b>does</b> query "+
        "sequentially. This however means that it transfers more data and is generally heavier to"+
        " compute, while showing less actual data. If you have a time filter, it will attempt to"+
        " show to most recent points in your search, up to your defined limit."
    };

    // Set and populate defaults
    var _d = {
      /** @scratch /panels/alertmap/3
       *
       * === Parameters
       *
       * field:: The field that contains the coordinates, in geojson format. GeoJSON is
       * +[longitude,latitude]+ in an array. This is different from most implementations, which use
       * latitude, longitude.
       */
      field   : null,
      /** @scratch /panels/alertmap/5
       * size:: The number of documents to use when drawing the map
       */
      size    : 1000,
      /** @scratch /panels/alertmap/5
       * spyable:: Should the `inspect` icon be shown?
       */
      spyable : true,
      /** @scratch /panels/alertmap/5
       * priority:: Which field to use for the priority causing different marker colors (expecting Low, Medium, or High)
       */
      priority : "priority",
      /** @scratch /panels/alertmap/5
       * tooltip:: Which field to use for the tooltip when hovering over a marker
       */
      tooltip : "_id",
      /** @scratch /panels/alertmap/5
       *
       * ==== Queries
       * queries object:: This object describes the queries to use on this panel.
       * queries.mode::: Of the queries available, which to use. Options: +all, pinned, unpinned, selected+
       * queries.ids::: In +selected+ mode, which query ids are selected.
       */
      queries     : {
        mode        : 'all',
        ids         : []
      },
    };

    _.defaults($scope.panel,_d);

    // inorder to use relative paths in require calls, require needs a context to run. Without
    // setting this property the paths would be relative to the app not this context/file.
    $scope.requireContext = localRequire;

    $scope.init = function() {
      $scope.$on('refresh',function(){
        $scope.get_data();
      });
      $scope.get_data();
    };

    $scope.get_data = function(segment,query_id) {
      $scope.require(['./leaflet/plugins'], function () {
        $scope.panel.error =  false;

        // Make sure we have everything for the request to complete
        if(dashboard.indices.length === 0) {
          return;
        }

        if(_.isUndefined($scope.panel.fieldLat) || _.isUndefined($scope.panel.fieldLng)) {
          $scope.panel.error = "Please provide a field that contain both the latitude and longitude required to place a marker";
          return;
        }

        // Determine the field to sort on
        var timeField = _.uniq(_.pluck(filterSrv.getByType('time'),'field'));
        if(timeField.length > 1) {
          $scope.panel.error = "Time field must be consistent amongst time filters";
        } else if(timeField.length === 0) {
          timeField = null;
        } else {
          timeField = timeField[0];
        }

        var _segment = _.isUndefined(segment) ? 0 : segment;

        $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
        var queries = querySrv.getQueryObjs($scope.panel.queries.ids);

        var boolQuery = $scope.ejs.BoolQuery();
        _.each(queries,function(q) {
          boolQuery = boolQuery.should(querySrv.toEjsObj(q));
        });

        var request = $scope.ejs.Request().indices(dashboard.indices[_segment])
          .query($scope.ejs.FilteredQuery(
            boolQuery,
            filterSrv.getBoolFilter(filterSrv.ids()).must($scope.ejs.ExistsFilter($scope.panel.fieldLat))
          ))
          .fields([$scope.panel.fieldLat,$scope.panel.fieldLng,$scope.panel.priority,$scope.panel.tooltip])
          .size($scope.panel.size);

        if(!_.isNull(timeField)) {
          request = request.sort(timeField,'desc');
        }

        $scope.populate_modal(request);
        var results = request.doSearch();

        // Populate scope when we have results
        results.then(function(results) {
          $scope.panelMeta.loading = false;

          if(_segment === 0) {
            $scope.hits = 0;
            $scope.data = [];
            query_id = $scope.query_id = new Date().getTime();
          }

          // Check for error and abort if found
          if(!(_.isUndefined(results.error))) {
            $scope.panel.error = $scope.parse_error(results.error);
            return;
          }

          // Check that we're still on the same query, if not stop
          if($scope.query_id === query_id) {
            // Keep only what we need for the set
            $scope.data = $scope.data.slice(0,$scope.panel.size).concat(_.map(results.hits.hits, function(hit) {
              return {
                type: hit['_index'],
                coordinates : new L.LatLng(
                  hit.fields[$scope.panel.fieldLng],
                  hit.fields[$scope.panel.fieldLat]
                ),
                priority : hit.fields[$scope.panel.priority],
                tooltip : hit.fields[$scope.panel.tooltip]
              };
            }));

          } else {
            return;
          }

          $scope.$emit('draw');

          // Get $size results then stop querying
          if($scope.data.length < $scope.panel.size && _segment+1 < dashboard.indices.length) {
            $scope.get_data(_segment+1,$scope.query_id);
          }

        });
      });
    };

    $scope.populate_modal = function(request) {
      $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);
    };

  });

  module.directive('alertmap', function() {
    return {
      restrict: 'A',
      link: function(scope, elem) {
        elem.html('<center><img src="img/load_big.gif"></center>');

        // Receive render events
        scope.$on('draw',function(){
          render_panel();
        });

        scope.$on('render', function(){
          if(!_.isUndefined(map)) {
            map.invalidateSize();
            map.getPanes();
          }
        });

        var map, layerGroup;

        function render_panel() {
          elem.css({height:scope.panel.height||scope.row.height});

          scope.require(['./leaflet/plugins'], function () {
            scope.panelMeta.loading = false;
            L.Icon.Default.imagePath = 'app/panels/alertmap/leaflet/images';
            if(_.isUndefined(map)) {
              map = L.map(scope.$id, {
                scrollWheelZoom: false,
                center: [40, -86],
                zoom: 10
              });

              // This could be made configurable?
              L.tileLayer('http://otile1.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpg', {
                attribution: 'Data, imagery and map information provided by MapQuest, '+
                  'OpenStreetMap <http://www.openstreetmap.org/copyright> and contributors, ODbL',
                maxZoom: 15,
                minZoom: 2
              }).addTo(map);
              layerGroup = new L.MarkerClusterGroup({maxClusterRadius:30});
            } else {
              layerGroup.clearLayers();
            }

            var markerList = [];
            var alertIconSize = [32,37];
            var eventIconSize = [32,37];
            var alertIconAnchor = [16, 35]; 
            var eventIconAnchor = [16, 35];

            var getMarkerIcon = function(data) {
              if (data.type == 'alert') {
                var pl = _.isArray(data.priority) ? data.priority[0] : data.priority;
                switch (pl) {
                  case "Low": 
                    return L.icon({ 
                      iconSize: alertIconSize,
                      iconAnchor: alertIconAnchor,
                      iconUrl: L.Icon.Default.imagePath + '/marker-icon-a-green.png' }
                    );
                  case "Medium": 
                    return L.icon({ 
                      iconSize: alertIconSize,
                      iconAnchor: alertIconAnchor,
                      iconUrl: L.Icon.Default.imagePath + '/marker-icon-a-yellow.png' 
                    });
                  case "High": 
                    return L.icon({ 
                      iconSize: alertIconSize,
                      iconAnchor: alertIconAnchor,
                      iconUrl: L.Icon.Default.imagePath + '/marker-icon-a-red.png' 
                    });
                  default: 
                    return L.icon({ 
                      iconSize: alertIconSize,
                      iconAnchor: alertIconAnchor,
                      iconUrl: L.Icon.Default.imagePath + '/marker-icon-unknown.png' 
                    });
                }
              } else {
                return L.icon({ 
                  iconSize: eventIconSize,
                  iconAnchor: eventIconAnchor,
                  iconUrl: L.Icon.Default.imagePath + '/marker-icon-e.png' 
                });
              }
            }

            _.each(scope.data, function(p) {
              if(!_.isUndefined(p.tooltip) && p.tooltip !== '') {
                markerList.push(L.marker(p.coordinates, {icon: getMarkerIcon(p) })
                  .bindLabel(_.isArray(p.tooltip) ? p.tooltip[0] : p.tooltip, {
                    offset: [alertIconAnchor[0], -alertIconAnchor[1]],
                    className: 'leaflet-alertmap-label'
                  }));
              } else {
                markerList.push(L.marker(p.coordinates, {icon: getMarkerIcon(p) }));
              }
            });

            layerGroup.addLayers(markerList);

            layerGroup.addTo(map);

            map.fitBounds(_.pluck(scope.data,'coordinates'));
          });
        }
      }
    };
  });

});
