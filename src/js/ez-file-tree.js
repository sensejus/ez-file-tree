(function ( angular ) {
  'use strict';

  angular.module('ez.fileTree', ['ez.object2array'])

  .constant('EzFileTreeConfig', {
    enableChecking: false, // show a checkbox beside each file
    enableFolderSelection: true, // allow folders to be selected
    multiSelect: false, // allow multiple files to be selected
    recursiveSelect: true, // recursively select/unselect a folders children
    icons: {
      chevronRight: 'fa fa-chevron-right',
      chevronDown: 'fa fa-chevron-down',
      folder: 'fa fa-folder',
      file: 'fa fa-file'
    },
    childrenField: 'children', // the field name to recurse
    idField: 'id', // the files id field
    typeField: 'type', // the files type field use to check if its a file/folder
    folderType: 'folder' // a file with {type: "folder"} is a folder
  })

  .directive('ezFileTree', ['$compile', '$timeout', 'EzFileTreeConfig', function($compile, $timeout, EzFileTreeConfig) {
    return {
      restrict: 'EA',
      replace: true,
      scope: {
        tree: '=ezFileTree',
        getChildren: '=?',
        config: '=?config'
      },
      templateUrl: 'ez-file-tree-container.html',
      compile: function(element, attrs) {
        // resolve config set in attrs
        var config = angular.extend({}, EzFileTreeConfig);
        for (var key in EzFileTreeConfig) {
          if (typeof attrs[key] !== 'undefined') {
            config[key] = attrs[key];
          }
        }

        return function (scope) {
          var init = function() {
            scope.config = angular.extend(config, scope.config); // merge scope config with the rest of the config
            scope.disableSelect = false;

            if (scope.config.multiSelect) {
              scope.tree._selectedFiles = {};
            } else {
              scope.tree._selectedFile = null;
            }

            scope.tree._activeFiles = {};

            if (scope.tree[scope.config.childrenField]) {
              setParentOnChildren(scope.tree, true);
            }
          };

          /**
           * Set parent reference on a file
           *
           * @param {object} file A file object
           * @param {boolean} recursive  Recurses child files if true
           */
          var setParentOnChildren = function(file, recursive) {
            for (var k in file[scope.config.childrenField]) {
              file[scope.config.childrenField][k]._parent = file;

              if (recursive && file[scope.config.childrenField][k][scope.config.childrenField]) {
                setParentOnChildren(file[scope.config.childrenField][k], true);
              }
            }
          };

          /**
           * Check if a folder has any files selected
           *
           * @param {object} file A file object
           * @return {boolean}
           */
          var hasChildrenSelected = function(file) {
            var selected = false;
            for (var key in file[scope.config.childrenField]) {
              if (file[scope.config.childrenField][key]._selected) {
                selected = true;
                break;
              } else if (file[scope.config.childrenField].files) {
                if (hasChildrenSelected(file[scope.config.childrenField])) {
                  selected = true;
                  break;
                }
              }
            }

            return selected;
          };

          /**
           * Set parent folders _active field to true
           *
           * @param {object} file A file object
           */
          var activate = function(file) {
            file._active = true;
            scope.tree._activeFiles[file[scope.config.idField]] = file;

            if (file._parent) {
              activate(file._parent);
            }
          };

          /**
           * Set a files _active property to false
           * set parents _active property as well if needed
           *
           * @params {object} file A file object
           */
          var deactivate = function(file) {
            var active = false;

            if (file.children && hasChildrenSelected(file)) {
              active = true;
            }

            if (!active) {
              delete scope.tree._activeFiles[file[scope.config.idField]];
            }

            file._active = active;

            if (active === false && file._parent !== undefined) {
              deactivate(file._parent);
            }
          };

          /**
           * Select a file
           *
           * @params {object} file A file object
           * @emits 'ez-file-tree.select' event
           */
          var select = function(file) {
            if (!scope.config.enableFolderSelection) {
              if (isFolder(file)) { // don't allow folders to be selected
                return;
              }
            }

            if (scope.config.multiSelect) {
              scope.tree._selectedFiles[file[scope.config.idField]] = file;
            } else {
              scope.tree._selectedFile = file;
              unselectAll(scope.tree[scope.config.childrenField]);
            }

            file._selected = true;

            scope.$emit('ez-file-tree.select', file);
            activate(file);
          };

          /**
           * Unselect a file and deactivate recursively if needed
           *
           * @params {object} file A file object
           * @emits 'ez-file-tree.select' event
           */
          var unselect = function(file) {
            file._selected = false;

            scope.$emit('ez-file-tree.unselect', file);

            if (scope.config.multiSelect) {
              delete scope.tree._selectedFiles[file[scope.config.idField]];
            } else {
              scope.tree._selectedFile = null;
            }

            deactivate(file);
          };

          /**
           * Unselect all files in the tree
           *
           * @param {array} files An array of files to unselect
           * @emits 'ez-file-tree.unselect' event
           */
          var unselectAll = function(files) {
            for (var key in files) {
              if (typeof files[key][scope.config.childrenField] !== 'undefined') {
                unselectAll(files[key][scope.config.childrenField]);
              }
              files[key]._selected = false;
              scope.$emit('ez-file-tree.unselect', files[key]);
            }
          };


          /**
           * Check if a file is a folder
           *
           * @param {object} file A file object
           * @return {boolean}
           */
          scope.isFolder = function(file) {
            return (typeof file.children !== undefined) || (file[scope.config.typeField] === scope.config.folderType);
          };

          /**
           * Opens/closes a folder
           *
           * @param {object} e A click event
           * @param {object} file A file object
           */
          scope.toggle = function(e, file) {
            if (!scope.isFolder(file)) {
              return;
            }

            scope.disableSelect = true;
            $timeout(function() {
              scope.disableSelect = false;
            }, 500);

            file._open = !file._open;

            if (!file.children || (file.children && !file.children.length)) {
              if (!scope.getChildren) {
                throw new Error('You must add a getChildren attribute');
              }

              scope.getChildren(file).then(function(children) {
                for (var key in children) {
                  children[key]._parent = file;
                }

                file.children = children;
              });
            }
          };

          /**
           * Checks if a checkbox should be shown
           *
           * @param {object} file A file object
           * @returns {boolean}
           */
          scope.showCheckbox = function(file) {
            if (!scope.config.enableChecking || (scope.isFolder(file) && !config.enableFolderSelection)) {
              return false;
            }

            return true;
          };


          /**
           * Toggle selection of an file
           *
           * @param {object} e A click event
           * @param {object} file A file object
           */
          scope.select = function(e, file) {
            e.preventDefault();
            $timeout(function() {
              if (scope.disableSelect === true) {
                return;
              }
              scope.disableSelect = false;

              if (!file._selected) {
                select(file);
              } else {
                unselect(file);
              }
            }, 200);
          };

          init();
        };
      }
    };
  }]);
})( angular );
