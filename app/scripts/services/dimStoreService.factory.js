(function() {
  'use strict';

  angular.module('dimApp')
    .factory('dimStoreService', StoreService);

  StoreService.$inject = ['$rootScope', '$q', 'dimBungieService', 'dimSettingsService', 'dimPlatformService', 'dimItemTier', 'dimCategory', 'dimItemDefinitions', 'dimItemBucketDefinitions', 'dimStatDefinitions', 'dimObjectiveDefinitions', 'dimTalentDefinitions', 'dimSandboxPerkDefinitions', 'dimYearsDefinitions', 'dimProgressionDefinitions'];

  function StoreService($rootScope, $q, dimBungieService, settings, dimPlatformService, dimItemTier, dimCategory, dimItemDefinitions, dimItemBucketDefinitions, dimStatDefinitions, dimObjectiveDefinitions, dimTalentDefinitions, dimSandboxPerkDefinitions, dimYearsDefinitions, dimProgressionDefinitions) {
    var _stores = [];
    var _index = 0;
    var vaultSizes = {};
    var bucketSizes = {};
    dimItemBucketDefinitions.then(function(defs) {
      _.each(defs, function(def, hash) {
        if (def.enabled) {
          bucketSizes[hash] = def.itemCount;
        }
      });
      vaultSizes['Weapons'] = bucketSizes[4046403665];
      vaultSizes['Armor'] = bucketSizes[3003523923];
      vaultSizes['General'] = bucketSizes[138197802];
    });

    // Cooldowns
    var cooldownsSuperA  = ['5:00', '4:46', '4:31', '4:15', '3:58', '3:40'];
    var cooldownsSuperB  = ['5:30', '5:14', '4:57', '4:39', '4:20', '4:00'];
    var cooldownsGrenade = ['1:00', '0:55', '0:49', '0:42', '0:34', '0:25'];
    var cooldownsMelee   = ['1:10', '1:04', '0:57', '0:49', '0:40', '0:29'];

    // Prototype for Store objects - add methods to this to add them to all
    // stores.
    var StoreProto = {
      // Get the total amount of this item in the store, across all stacks.
      amountOfItem: function(item) {
        return sum(_.filter(this.items, function(i) {
          return i.hash === item.hash && i.sort !== 'Postmaster';
        }), 'amount');
      },
      // How much of items like this item can fit in this store?
      capacityForItem: function(item) {
        if (!item.bucket) {
          console.error("item needs a 'bucket' field", item);
        }
        return bucketSizes[item.bucket] || 10;
      },
      // How many *more* items like this item can fit in this store?
      spaceLeftForItem: function(item) {
        if (!item.type) {
          throw new Error("item needs a 'type' field");
        }
        return this.capacityForItem(item) - count(this.items, { type: item.type });
      },
      updateCharacterInfo: function(characterInfo) {
        this.level = characterInfo.characterLevel;
        this.percentToNextLevel = characterInfo.percentToNextLevel;
        this.powerLevel = characterInfo.characterBase.powerLevel;
        this.background = characterInfo.backgroundPath;
        this.icon = characterInfo.emblemPath;
        this.stats = getStatsData(characterInfo.characterBase);
      }
    };

    // Prototype for Item objects - add methods to this to add them to all
    // items.
    var ItemProto = {
      // Can this item be equipped by the current store?
      canBeEquippedBy: function(store) {
        if (store.isVault) {
          return false;
        }
        return this.equipment &&
          // For the right class
          (this.classTypeName === 'unknown' || this.classTypeName === store.class) &&
          // nothing we are too low-level to equip
          this.equipRequiredLevel <= store.level &&
          // can be moved or is already here
          (!this.notransfer || this.owner === store.id) &&
          this.sort !== 'Postmaster';
      }
    };

    var service = {
      getStores: getStores,
      reloadStores: reloadStores,
      getStore: getStore,
      getVault: getStore.bind(null, 'vault'),
      updateCharacters: updateCharacters,
      setHeights: setHeightsAsync,
      createItemIndex: createItemIndex,
      processItems: getItems
    };

    $rootScope.$on('dim-settings-updated', function(setting) {
      if (_.has(setting, 'characterOrder')) {
        sortStores(_stores).then(function(stores) {
          _stores = stores;
        });
      }
    });

    return service;

    // Update the high level character information for all the stores
    // (level, light, int/dis/str, etc.). This does not update the
    // items in the stores - to do that, call reloadStores.
    function updateCharacters() {
      return dimBungieService.getCharacters(dimPlatformService.getActive()).then(function(bungieStores) {
        _.each(_stores, function(dStore) {
          if (!dStore.isVault) {
            var bStore = _.findWhere(bungieStores, { id: dStore.id });
            dStore.updateCharacterInfo(bStore.base);
          }
        });
        return _stores;
      });
    }

    function getNextIndex() {
      return _index++;
    }

    function setHeightsAsync() {
      setTimeout(setHeights, 0);
    }

    // Equalize the heights of the various rows of items.
    // TODO: replace with flexbox
    function setHeights() {
      function outerHeight(el) {
        //var height = el.offsetHeight;
        var style = getComputedStyle(el);

        var height = parseInt(style.height);
        return height;
      }

      function outerWidth(el) {
        var width = el.offsetWidth;
        var style = getComputedStyle(el);

        width += parseInt(style.marginLeft) + parseInt(style.marginRight);
        return width;
      }

      var fn = function(memo, section) {
        var childHeight = 0;

        _.each(section.children, function(child) {
          var t = outerHeight(child);
          childHeight = (childHeight > t) ? childHeight : t;
        });

        if (childHeight > memo) {
          memo = childHeight;
        }

        return memo;
      };

      var setHeight = function(query) {
        var height = _.reduce(document.querySelectorAll(query), fn, 0);

        var style = document.querySelectorAll('style[id=' + ((query.replace(/\./g, '')).replace(/\s/g, '')) + ']');

        if (style.length > 0) {
          style = style[0];
        } else {
          style = document.createElement('style');
          style.type = 'text/css';
          style.id = (query.replace(/\./g, '')).replace(/\s/g, '');
          document.getElementsByTagName('head')[0].appendChild(style);
        }

        style.innerHTML = query + ' { min-height: ' + (height) + 'px; }';
      };

      setHeight('.sub-section.sort-class');
      setHeight('.sub-section.sort-primary');
      setHeight('.sub-section.sort-special');
      setHeight('.sub-section.sort-heavy');
      setHeight('.sub-section.sort-helmet');
      setHeight('.sub-section.sort-chest');
      setHeight('.sub-section.sort-gauntlets');
      setHeight('.sub-section.sort-leg');
      setHeight('.sub-section.sort-classitem');
      setHeight('.sub-section.sort-artifact');
      setHeight('.sub-section.sort-emblem');
      setHeight('.sub-section.sort-armor');
      setHeight('.sub-section.sort-ghost');
      setHeight('.sub-section.sort-emote');
      setHeight('.sub-section.sort-ship');
      setHeight('.sub-section.sort-vehicle');
      setHeight('.sub-section.sort-horn');
      setHeight('.sub-section.sort-consumable');
      setHeight('.sub-section.sort-material');
      setHeight('.sub-section.sort-missions');
      setHeight('.sub-section.sort-bounties');
      setHeight('.sub-section.sort-messages');
      setHeight('.sub-section.sort-special-orders');
      setHeight('.sub-section.sort-lost-items');
      setHeight('.sub-section.sort-quests');
      setHeight('.weapons');
      setHeight('.armor');
      setHeight('.general');
    }

    function sortStores(stores) {
      return settings.getSetting('characterOrder')
        .then(function(characterOrder) {
          if (characterOrder === 'mostRecent') {
            return _.sortBy(stores, 'lastPlayed').reverse();
          } else {
            return _.sortBy(stores, 'id');
          }
        });
    }

    function getStores() {
      return _stores;
    }

    // Returns a promise for a fresh view of the stores and their items.
    function reloadStores() {
      return dimBungieService.getStores(dimPlatformService.getActive())
        .then(function(rawStores) {
          var glimmer, marks;

          return $q.all(rawStores.map(function(raw) {
            var store;
            var items = [];
            if (!raw) {
              return undefined;
            }

            if (raw.id === 'vault') {
              store = angular.extend(Object.create(StoreProto), {
                id: 'vault',
                name: 'vault',
                lastPlayed: '2005-01-01T12:00:01Z',
                icon: '',
                items: [],
                legendaryMarks: marks,
                glimmer: glimmer,
                bucketCounts: {},
                isVault: true,
                // Vault has different capacity rules
                capacityForItem: function(item) {
                  if (!item.sort) {
                    throw new Error("item needs a 'sort' field");
                  }
                  return vaultSizes[item.sort];
                },
                spaceLeftForItem: function(item) {
                  if (!item.sort) {
                    throw new Error("item needs a 'sort' field");
                  }
                  return this.capacityForItem(item) - count(this.items, { sort: item.sort });
                }
              });

              _.each(raw.data.buckets, function(bucket) {
                if (bucket.bucketHash === 3003523923)
                  store.bucketCounts.Armor = _.size(bucket.items);
                if (bucket.bucketHash === 138197802)
                  store.bucketCounts.General = _.size(bucket.items);
                if (bucket.bucketHash === 4046403665)
                  store.bucketCounts.Weapons = _.size(bucket.items);

                _.each(bucket.items, function(item) {
                  item.bucket = bucket.bucketHash;
                });

                items = _.union(items, bucket.items);
              });
            } else {


              try {
                glimmer = _.find(raw.character.base.inventory.currencies, function(cur) { return cur.itemHash === 3159615086; }).value;
                marks = _.find(raw.character.base.inventory.currencies, function(cur) { return cur.itemHash === 2534352370; }).value;
              } catch (e) {
                glimmer = 0;
                marks = 0;
              }

              store = angular.extend(Object.create(StoreProto), {
                id: raw.id,
                icon: raw.character.base.emblemPath,
                lastPlayed: raw.character.base.characterBase.dateLastPlayed,
                background: raw.character.base.backgroundPath,
                level: raw.character.base.characterLevel,
                powerLevel: raw.character.base.characterBase.powerLevel,
                stats: getStatsData(raw.character.base.characterBase),
                class: getClass(raw.character.base.characterBase.classType),
                gender: getGender(raw.character.base.characterBase.genderType),
                race: getRace(raw.character.base.characterBase.raceHash),
                percentToNextLevel: raw.character.base.percentToNextLevel,
                isVault: false
              });
              store.name = store.class;

              _.each(raw.data.buckets, function(bucket) {
                _.each(bucket, function(pail) {
                  _.each(pail.items, function(item) {
                    item.bucket = pail.bucketHash;
                  });

                  items = _.union(items, pail.items);
                });
              });

              if (_.has(raw.character.base.inventory.buckets, 'Invisible')) {
                if (_.size(raw.character.base.inventory.buckets.Invisible) > 0) {
                  _.each(raw.character.base.inventory.buckets.Invisible, function(pail) {
                    items = _.union(items, pail.items);
                  });
                }
              }
            }

            return getItems(store.id, items).then(function(items) {
              store.items = items;
              return store;
            });
          }));
        })
        .then(function(stores) {
          return sortStores(stores);
        })
        .then(function(stores) {
          _stores = stores;

          $rootScope.$broadcast('dim-stores-updated', {
            stores: stores
          });
          setHeightsAsync();

          return stores;
        });
    }

    function getStore(id) {
      return _.find(_stores, { id: id });
    }

    var idTracker = {};

    // Set an ID for the item that should be unique across all items
    function createItemIndex(item) {
      // Try to make a unique, but stable ID. This isn't always possible, such as in the case of consumables.
      var index = item.hash + '-';
      if (item.id === '0') {
        index = index + item.amount;
        idTracker[index] = (idTracker[index] || 0) + 1;
        index = index + '-' + idTracker[index];
      } else {
        index = index + item.id;
      }
      return index;
    }

    function processSingleItem(definitions, itemBucketDef, statDef, objectiveDef, perkDefs, talentDefs, yearsDefs, progressDefs, item) {
      var itemDef = definitions[item.itemHash];
      // Missing definition?
      if (!itemDef || itemDef.itemName === 'Classified') {
        // maybe it is classified...
        itemDef = {
          classified: true,
          icon: '/img/misc/missing_icon.png'
        };

        if (item.itemHash === 194424271) {
          itemType = 'Armor Shader';
          itemDef.bucketTypeHash = 2973005342;
          itemDef.classType = 3;
          itemDef.itemTypeName = 'Armor Shader';
          itemDef.description = '';
          itemDef.itemName = 'Walkabout - Classified';
          itemDef.nonTransferrable = true;
          itemDef.equipRequiredLevel = 0;
          itemDef.equipment = true;
          item.isEquipment = true;
        }

        if (item.itemHash === 1963806104) {
          itemType = 'Mystery Bag';
          itemDef.bucketTypeHash = 1469714392;
          itemDef.icon = "/common/destiny_content/icons/3651da8a8b0add3161e840c7104078ed.jpg";
          itemDef.classType = 3;
          itemDef.itemTypeName = itemType;
          itemDef.description = "Contains 1 Guaranteed Item and up to 4 Possible Items. This item is nonreturnable.";
          itemDef.itemName = "Sterling Treasure";
          itemDef.maxStackSize = 99;
          itemDef.nonTransferrable = true;
          itemDef.equipRequiredLevel = 0;
          itemDef.equipment = false;
          item.isEquipment = false;
        }

        // unidentified item.
        if (!itemDef.itemName) {
          console.warn('Missing Item Definition:\n\n', item, '\n\nplease contact a developer to get this item added.');
          window.onerror("Missing Item Definition - " + JSON.stringify(_.pick(item, 'canEquip', 'cannotEquipReason', 'equipRequiredLevel', 'isEquipment', 'itemHash', 'location', 'stackSize', 'talentGridHash')), 'dimStoreService.factory.js', 491, 11);
        }
      }

      if (!itemDef.itemTypeName || !itemDef.itemName) {
        return null;
      }

      var itemType = getItemType(item, itemDef, itemBucketDef);
      if (!itemType) {
        return null;
      }

      var weaponClass = null, weaponClassName = null;

      if (itemType.hasOwnProperty('general') && itemType.general !== '') {
        weaponClass = itemType.weaponClass;
        weaponClassName = itemType.weaponClassName;
        itemType = itemType.general;
      }

      var itemSort = sortItem(itemDef.itemTypeName);
      if (!itemSort) {
        console.log(itemDef.itemTypeName + " does not have a sort property.");
      }

      if (item.location === 4) {
        itemSort = 'Postmaster';

        if (itemType !== 'Messages')
          if (itemType === 'Consumable') {
            itemType = 'Special Orders';
          } else {
            itemType = 'Lost Items';
          }
      }

      var dmgName = [null, 'kinetic', 'arc', 'solar', 'void'][item.damageType];

      var createdItem = angular.extend(Object.create(ItemProto), {
        hash: item.itemHash,
        type: itemType,
        sort: itemSort,
        tier: itemDef.tierTypeName || 'Common',
        name: itemDef.itemName,
        description: itemDef.itemDescription || '', // Added description for Bounties for now JFLAY2015
        icon: itemDef.icon,
        notransfer: (itemSort === 'Postmaster' || itemDef.nonTransferrable),
        id: item.itemInstanceId,
        equipped: item.isEquipped,
        bucket: itemDef.bucketTypeHash,
        equipment: item.isEquipment,
        complete: item.isGridComplete,
        percentComplete: null,
        amount: item.stackSize,
        primStat: item.primaryStat,
        // "perks" are the two or so talent grid items that are "featured" for an
        // item in its popup in the game. We don't currently use these.
        //perks: item.perks,
        equipRequiredLevel: item.equipRequiredLevel,
        maxStackSize: (itemDef.maxStackSize > 0) ? itemDef.maxStackSize : 1,
        // 0: titan, 1: hunter, 2: warlock, 3: any
        classType: itemDef.classType,
        classTypeName: getClass(itemDef.classType),
        dmg: dmgName,
        visible: true,
        year: (yearsDefs.year1.indexOf(item.itemHash) >= 0 ? 1 : 2),
        lockable: item.lockable,
        locked: item.locked,
        weaponClass: weaponClass || '',
        weaponClassName: weaponClassName,
        classified: itemDef.classified
      });
      createdItem.index = createItemIndex(createdItem);

      try {
        createdItem.stats = buildStats(item, itemDef, statDef);
      } catch(e) {
        console.error("Error building stats for " + createdItem.name, item, itemDef);
      }
      try {
        createdItem.talentGrid = buildTalentGrid(item, talentDefs, progressDefs, perkDefs);

      } catch(e) {
        console.error("Error building talent grid for " + createdItem.name, item, itemDef);
      }
      try {
        createdItem.objectives = buildObjectives(item, objectiveDef, itemDef);
      } catch(e) {
        console.error("Error building objectives for " + createdItem.name, item, itemDef);
      }

      // More objectives properties
      if (createdItem.objectives) {
        createdItem.complete = (!createdItem.talentGrid || createdItem.complete) && _.all(createdItem.objectives, 'complete');
        createdItem.percentComplete = Math.floor(100 * sum(createdItem.objectives, function(objective) {
          return Math.min(1.0, objective.progress / objective.completionValue) / createdItem.objectives.length;
        }));
      } else if (createdItem.talentGrid) {
        createdItem.percentComplete = Math.floor(100 * Math.min(1.0, createdItem.talentGrid.totalXP / createdItem.talentGrid.totalXPRequired));
      }

      return createdItem;
    }

    function buildTalentGrid(item, talentDefs, progressDefs, perkDefs) {
      var talentGridDef = talentDefs[item.talentGridHash];
      if (!item.progression || !talentGridDef) {
        return undefined;
      }

      var totalXP = item.progression.currentProgress;
      var totalLevel = item.progression.level; // Can be way over max

      // progressSteps gives the XP needed to reach each level, with
      // the last element repeating infinitely.
      var progressSteps = progressDefs[item.progression.progressionHash].steps;
      // Total XP to get to specified level
      function xpToReachLevel(level) {
        if (level === 0) {
          return 0;
        }
        var totalXPRequired = 0;
        for (var step = 1; step <= level; step++) {
          totalXPRequired += progressSteps[Math.min(step, progressSteps.length) - 1];
        }

        return totalXPRequired;
      }

      var possibleNodes = talentGridDef.nodes;

      // var featuredPerkNames = item.perks.map(function(perk) {
      //   var perkDef = perkDefs[perk.perkHash];
      //   return perkDef ? perkDef.displayName : 'Unknown';
      // });

      var gridNodes = item.nodes.map(function(node) {
        var talentNodeGroup = possibleNodes[node.nodeHash];
        var talentNodeSelected = talentNodeGroup.steps[node.stepIndex];

        var nodeName = talentNodeSelected.nodeStepName;

        // Filter out some weird bogus nodes
        if (!nodeName || nodeName.length === 0 || talentNodeGroup.column < 0) {
          return undefined;
        }

        // Only one node in this column can be selected (scopes, etc)
        var exclusiveInColumn = !!(talentNodeGroup.exlusiveWithNodes &&
                                   talentNodeGroup.exlusiveWithNodes.length > 0);

        // Unlocked is whether or not the material cost has been paid
        // for the node
        var unlocked = node.isActivated ||
              talentNodeGroup.autoUnlocks ||
              // If only one can be activated, the cost only needs to be
              // paid once per row.
              (exclusiveInColumn &&
               _.any(talentNodeGroup.exlusiveWithNodes, function(nodeIndex) {
                 return item.nodes[nodeIndex].isActivated;
               }));

        // Calculate relative XP for just this node
        var startProgressionBarAtProgress = talentNodeSelected.startProgressionBarAtProgress;
        var activatedAtGridLevel = talentNodeSelected.activationRequirement.gridLevel;
        var xpRequired = xpToReachLevel(activatedAtGridLevel) - startProgressionBarAtProgress;
        var xp = Math.max(0, Math.min(totalXP - startProgressionBarAtProgress, xpRequired));

        // There's a lot more here, but we're taking just what we need
        return {
          name: nodeName,
          description: talentNodeSelected.nodeStepDescription,
          icon: talentNodeSelected.icon,
          // XP put into this node
          xp: xp,
          // XP needed for this node to unlock
          xpRequired: xpRequired,
          // Position in the grid
          column: talentNodeGroup.column,
          row: talentNodeGroup.row,
          // Is the node selected (lit up in the grid)
          activated: node.isActivated,
          // The item level at which this node can be unlocked
          activatedAtGridLevel: activatedAtGridLevel,
          // Only one node in this column can be selected (scopes, etc)
          exclusiveInColumn: exclusiveInColumn,
          // Whether there's enough XP in the item to buy the node
          xpRequirementMet: activatedAtGridLevel <= totalLevel,
          // Whether or not the material cost has been paid for the node
          unlocked: unlocked,
          // Some nodes don't show up in the grid, like purchased ascend nodes
          hidden: node.hidden

          // Whether (and in which order) this perk should be
          // "featured" on an abbreviated info panel, as in the
          // game. 0 = not featured, positive numbers signify the
          // order of the featured perks.
          //featuredPerk: (featuredPerkNames.indexOf(nodeName) + 1)

          // This list of material requirements to unlock the
          // item are a mystery. These hashes don't exist anywhere in
          // the manifest database. Also, the activationRequirement
          // object doesn't say how much of the material is
          // needed. There's got to be some missing DB somewhere with
          // this info.
          //materialsNeeded: talentNodeSelected.activationRequirement.materialRequirementHashes

          // These are useful for debugging or searching for new properties,
          // but they don't need to be included in the result.
          //talentNodeGroup: talentNodeGroup,
          //talentNodeSelected: talentNodeSelected,
          //itemNode: node
        };
      });
      gridNodes = _.compact(gridNodes);

      // This can be handy for visualization/debugging
      //var columns = _.groupBy(gridNodes, 'column');

      var maxLevelRequired = _.max(gridNodes, 'activatedAtGridLevel').activatedAtGridLevel;
      var totalXPRequired = xpToReachLevel(maxLevelRequired);

      var ascendNode = _.find(gridNodes, { name: 'Ascend' });

      // Fix for stuff that has nothing in early columns
      var minColumn = _.min(gridNodes, 'column').column;
      if (minColumn > 0) {
        gridNodes.forEach(function(node) { node.column -= minColumn; });
      }

      return {
        nodes: _.sortBy(gridNodes, function(node) { return node.column + 0.1 * node.row; }),
        xpComplete: totalXPRequired <= totalXP,
        totalXPRequired: totalXPRequired,
        totalXP: Math.min(totalXPRequired, totalXP),
        hasAscendNode: !!ascendNode,
        ascended: !!(ascendNode && ascendNode.activated),
        hasReforgeNode: _.any(gridNodes, { name: 'Reforge Ready' }),
        infusable: _.any(gridNodes, { name: 'Infuse' })
      };
    }

    function buildObjectives(item, objectiveDef, def) {
      if (!item.objectives || !item.objectives.length) {
        return undefined;
      }

      return item.objectives.map(function(objective) {
        var def = objectiveDef[objective.objectiveHash];

        return {
          description: def.displayDescription,
          progress: objective.progress,
          completionValue: def.completionValue,
          complete: objective.isComplete,
          boolean: def.completionValue === 1
        };
      });
    }

    function buildStats(item, itemDef, statDef) {
      if (!item.stats || !item.stats.length || !itemDef.stats) {
        return undefined;
      }
      return _.sortBy(_.compact(_.map(itemDef.stats, function(stat) {
        var def = statDef[stat.statHash];
        if (!def) {
          return undefined;
        }

        var name = def.statName;
        if (name === 'Aim assistance') {
          name = 'Aim Assist';
        }

        // Only include these hidden stats, in this order
        var secondarySort = ['Aim Assist', 'Equip Speed'];
        var secondaryIndex = -1;

        var sort = _.findIndex(item.stats, { statHash: stat.statHash });
        var itemStat;
        if (sort < 0) {
          secondaryIndex = secondarySort.indexOf(name);
          sort = 50 + secondaryIndex;
        } else {
          itemStat = item.stats[sort];
          // Always at the end
          if (name === 'Magazine' || name === 'Energy') {
            sort = 100;
          }
        }

        if (!itemStat && secondaryIndex < 0) {
          return undefined;
        }

        var maximumValue = 100;
        if (itemStat && itemStat.maximumValue) {
          maximumValue = itemStat.maximumValue;
        }

        return {
          name: name,
          sort: sort,
          value: itemStat ? itemStat.value : stat.value,
          maximumValue: maximumValue,
          bar: name !== 'Magazine' && name !== 'Energy' // energy == magazine for swords
        };
      })), 'sort');
    }

    function getItems(owner, items) {
      idTracker = {};
      return $q.all([
        dimItemDefinitions,
        dimItemBucketDefinitions,
        dimStatDefinitions,
        dimObjectiveDefinitions,
        dimSandboxPerkDefinitions,
        dimTalentDefinitions,
        dimYearsDefinitions,
        dimProgressionDefinitions])
        .then(function(args) {
          var result = [];
          _.each(items, function (item) {
            var createdItem = null;
            try {
              createdItem = processSingleItem.apply(undefined, args.concat(item));
            } catch(e) {
              console.error("Error processing item", item, e);
            }
            if (createdItem !== null) {
              createdItem.owner = owner;
              result.push(createdItem);
            }
          });
          return result;
        });
    }

    function getClass(type) {
      switch (type) {
        case 0:
          return 'titan';
        case 1:
          return 'hunter';
        case 2:
          return 'warlock';
      }
      return 'unknown';
    }

    function getRace(hash) {
      switch (hash) {
        case 3887404748:
          return 'human';
        case 898834093:
          return 'exo';
        case 2803282938:
          return 'awoken';
      }
      return 'unknown';
    }

    function getGender(type) {
      switch (type) {
        case 0:
          return 'male';
        case 1:
          return 'female';
      }
      return 'unknown';
    }

    /* Not Implemented */
    // Engram,
    // Trials Reward,
    // Currency,
    // Material Exchange,
    // Equipment,
    // Invitation,
    // Camera,
    // Buff,
    // Bribe,
    // Incomplete Engrams,
    // Corrupted Engrams,

    function getItemType(item, def, buckets) {
      var type = def.itemTypeName;
      var name = def.itemName;
      // def.bucketTypeHash is where it goes
      var normalBucket = buckets[def.bucketTypeHash];
      // item.bucket is where it IS
      var currentBucket = buckets[item.bucket];

      // TODO: time to dig through this code
      if (currentBucket && currentBucket.bucketName === 'Messages') {
        return 'Messages';
      }

      if (name == 'SRL Record Book') {
        return 'Missions';
      }

      // File "Mote of Light" under "Material"
      if (item.itemHash === 937555249) {
        return 'Material';
      }

      if (def.bucketTypeHash === 3621873013) {
        return null;
      }

      if (def.bucketTypeHash === 2422292810) {
        if (item.location !== 4)
          return null;
      }

      if (type.indexOf('Mystery Bag') != -1) {
        return 'Consumable';
      }

      if (type.indexOf('Junk') != -1) {
        return 'Consumable';
      }

      if (def.bucketTypeHash === 375726501) {
        if (type.indexOf("Message ") != -1) {
          return 'Messages';
        }

        if (type.indexOf("Package") != -1) {
          return 'Messages';
        }

        if (["Public Event Completed"].indexOf(name) != -1) {
          return "Messages";
        }

        return 'Missions';
      }


      if (_.isUndefined(type) || _.isUndefined(name)) {
        return {
          'general': 'General',
          'weaponClass': 'General'
        };
      }

      //if(type.indexOf("Engram") != -1 || name.indexOf("Marks") != -1) {
      if (name.indexOf("Marks") != -1) {
        return null;
      }

      if (type === 'Mission Reward') {
        return null;
      }

      // Used to find a "weaponClass" type to send back
      var typeObj = {
        general: '',
        weaponClass: type.toLowerCase().replace(/\s/g, ''),
        weaponClassName: type
      };

      if (["Pulse Rifle", "Scout Rifle", "Hand Cannon", "Auto Rifle", "Primary Weapon Engram"].indexOf(type) != -1)
        typeObj.general = 'Primary';
      if (["Sniper Rifle", "Shotgun", "Fusion Rifle", "Sidearm", "Special Weapon Engram"].indexOf(type) != -1) {
        typeObj.general = 'Special';

        // detect special case items that are actually primary weapons.
        if (["Vex Mythoclast", "Universal Remote", "No Land Beyond"].indexOf(name) != -1) {
          typeObj.general = 'Primary';
        }

        if (def.itemHash === 3012398149) {
          typeObj.general = 'Heavy';
        }
      }
      if (["Rocket Launcher", "Sword", "Machine Gun", "Heavy Weapon Engram"].indexOf(type) != -1)
        typeObj.general = 'Heavy';
      if (["Titan Mark", "Hunter Cloak", "Warlock Bond", "Class Item Engram"].indexOf(type) != -1)
        return 'ClassItem';
      if (["Gauntlet Engram"].indexOf(type) != -1)
        return 'Gauntlets';
      if (type==='Mask') {
        return 'Helmet';
      }
      if (["Gauntlets", "Helmet", 'Mask', "Chest Armor", "Leg Armor", "Helmet Engram", "Leg Armor Engram", "Body Armor Engram"].indexOf(type) != -1)
        return (type.split(' ')[0] === 'Body') ? "Chest" : type.split(' ')[0];
      if (["Titan Subclass", "Hunter Subclass", "Warlock Subclass"].indexOf(type) != -1)
        return 'Class';
      if (["Restore Defaults"].indexOf(type) != -1)
        return 'Armor';
      if (["Currency"].indexOf(type) != -1) {
        if (["Vanguard Marks", "Crucible Marks"].indexOf(name) != -1)
          return '';
        return 'Material';
      }
      if (["Commendation", "Trials of Osiris", "Faction Badge"].indexOf(type) != -1) {
        if (name.indexOf("Redeemed") != -1) {
          return null;
        }

        return 'Missions';
      }

      if (type.indexOf("Summoning Rune") != -1) {
        return "Material";
      }

      if (type.indexOf("Emote") != -1) {
        return "Emote";
      }

      if (type.indexOf("Artifact") != -1) {
        return "Artifact";
      }

      if (type.indexOf(" Bounty") != -1) {
        if (def.hasAction === true) {
          return 'Bounties';
        } else {
          return null;
        }
      }

      if (type.indexOf("Treasure Map") != -1) {
        return 'Bounties';
      }

      if (type.indexOf("Bounty Reward") != -1) {
        return 'Bounties';
      }

      if (type.indexOf("Queen's Orders") != -1) {
        return 'Bounties';
      }

      if (type.indexOf("Curio") != -1) {
        return 'Bounties';
      }
      if (type.indexOf("Vex Technology") != -1) {
        return 'Bounties';
      }

      if (type.indexOf("Horn") != -1) {
        return "Horn";
      }

      if (type.indexOf("Quest") != -1) {
        return 'Quests';
      }

      if (type.indexOf("Relic") != -1) {
        return 'Bounties';
      }

      if (type.indexOf("Message ") != -1) {
        return 'Messages';
      }

      if (type.indexOf("Package") != -1) {
        return 'Messages';
      }

      if (type.indexOf("Armsday Order") != -1) {
        switch (def.bucketTypeHash) {
          case 2465295065:
            return 'Special';
          case 1498876634:
            return 'Primary';
          case 953998645:
            return 'Heavy';
          default:
            return 'Special Orders';
        }
      }

      if (["Vehicle Upgrade", 'Junk', 'Mystery Bag'].indexOf(type) != -1) {
        return "Consumable";
      }

      if (typeObj.general !== '') {
        return typeObj;
      }

      if (["Public Event Completed"].indexOf(name) != -1) {
        return "Messages";
      }

      if (["Vehicle Upgrade", 'Junk', 'Mystery Bag'].indexOf(type) != -1) {
        return "Consumable";
      }

      if (["Armor Shader", "Emblem", "Ghost Shell", "Ship", "Vehicle", "Consumable", "Material", "Ship Schematics"].indexOf(type) != -1)
        return type.split(' ')[0];

      return null;
    }

    function sortItem(type) {
      if (["Pulse Rifle", "Sword", "Sniper Rifle", "Shotgun", "Scout Rifle", "Sidearm", "Hand Cannon", "Fusion Rifle", "Rocket Launcher", "Auto Rifle", "Machine Gun", "Primary Weapon Engram", "Special Weapon Engram", "Heavy Weapon Engram"].indexOf(type) != -1)
        return 'Weapons';
      if (["Titan Mark", "Hunter Cloak", "Warlock Bond", "Helmet Engram", "Leg Armor Engram", "Body Armor Engram", "Gauntlet Engram", "Gauntlets", "Helmet", 'Mask', "Chest Armor", "Leg Armor", "Class Item Engram"].indexOf(type) != -1)
        return 'Armor';
      if (["Quest Step", "Warlock Artifact", "Hunter Artifact", "Titan Artifact", "Faction Badge", "Treasure Map", "Vex Technology", "Curio", "Relic", "Summoning Rune", "Queen's Orders", "Crucible Bounty", "Vanguard Bounty", "Vehicle Upgrade", "Emote", "Restore Defaults", "Titan Subclass", "Hunter Subclass", "Warlock Subclass", "Horn", "Armor Shader", "Emblem", "Ghost Shell", "Ship", "Ship Schematics", "Vehicle", "Consumable", "Material", "Currency"].indexOf(type) != -1)
        return 'General';
      if (["Daily Reward", "Package", "Armsday Order"]) {
        return 'Postmaster';
      }

      if (type.indexOf("Message ") != -1) {
        return 'Postmaster';
      }
    }


    //---- following code is from https://github.com/DestinyTrialsReport
    function getAbilityCooldown(subclass, ability, tier) {
      if (ability === 'STAT_INTELLECT') {
        switch (subclass) {
          case 2007186000: // Defender
          case 4143670656: // Nightstalker
          case 2455559914: // Striker
          case 3658182170: // Sunsinger
            return cooldownsSuperA[tier];
          default:
            return cooldownsSuperB[tier];
        }
      } else if (ability === 'STAT_DISCIPLINE') {
        return cooldownsGrenade[tier];
      } else if (ability === 'STAT_STRENGTH') {
        switch (subclass) {
          case 4143670656: // Nightstalker
          case 1716862031: // Gunslinger
            return cooldownsMelee[tier];
          default:
            return cooldownsGrenade[tier];
        }
      } else {
        return '-:--';
      }
    }

    function getStatsData(data) {
      var statsWithTiers = ['STAT_INTELLECT', 'STAT_DISCIPLINE', 'STAT_STRENGTH'];
      var stats = ['STAT_INTELLECT', 'STAT_DISCIPLINE', 'STAT_STRENGTH', 'STAT_ARMOR', 'STAT_RECOVERY', 'STAT_AGILITY'];
      var ret = {};
      for (var s = 0; s < stats.length; s++) {
        var statHash = {};
        switch(stats[s]) {
          case 'STAT_INTELLECT': statHash.name = 'Intellect'; statHash.effect = 'Super'; break;
          case 'STAT_DISCIPLINE': statHash.name = 'Discipline'; statHash.effect = 'Grenade'; break;
          case 'STAT_STRENGTH': statHash.name = 'Strength'; statHash.effect = 'Melee'; break;
        }
        statHash.value = data.stats[stats[s]].value;

        if (statsWithTiers.indexOf(stats[s]) > -1) {
          statHash.normalized = statHash.value > 300 ? 300 : statHash.value;
          statHash.tier = Math.floor(statHash.normalized / 60);
          statHash.tiers = [];
          statHash.remaining = statHash.value;
          for (var t = 0; t < 5; t++) {
            statHash.remaining -= statHash.tiers[t] = statHash.remaining > 60 ? 60 : statHash.remaining;
          }
          statHash.cooldown = getAbilityCooldown(data.peerView.equipment[0].itemHash, stats[s], statHash.tier);
          statHash.percentage = +(100 * statHash.normalized / 300).toFixed();
        } else {
          statHash.percentage = +(100 * statHash.value / 10).toFixed();
        }

        ret[stats[s]] = statHash;
      }
      return ret;
    }
    // code above is from https://github.com/DestinyTrialsReport
  }
})();
