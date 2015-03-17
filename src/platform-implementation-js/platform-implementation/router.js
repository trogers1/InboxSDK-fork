'use strict';

var _ = require('lodash');
var Bacon = require('baconjs');
import RSVP from 'rsvp';

var HandlerRegistry = require('../lib/handler-registry');

var RouteView = require('../views/route-view/route-view');
var ListRouteView = require('../views/route-view/list-route-view');
var CustomRouteView = require('../views/route-view/custom-route-view');

const memberMap = new WeakMap();

/**
* @class
* This namespace contains functionality associated with creating your own content inside Gmail or Inbox. It allows you to define "Routes"
* which define a full page of content and an associated URL space for which they are active. You can think of routes as different pages
* in your application. Gmail and Inbox already have a few routes built in (Inbox, Sent, Drafts, etc). This namespace allows you to define
* your own as well as listen in on the built in routes being navigated to.
*
* This is typically used when you want to create content to fill the main content area of Gmail or Inbox.
*
* Every route has a URL associated with it and can have optional parameters. However, you never construct these URL's manually.
* The SDK will take care of creating a URL that will work in Gmail/Inbox for your Route. Since these URL's may change due to
* implementations of Gmail/Inbox, you should always create new links when trying to set URL on elements or simply use the goto
* function which naviagtes to the created link automatically.
*
* Using the <code>handleX</code> family of methods, you can specify which routes your application can handle. You will be called back with
* and instance of a RouteView or similar when the user navigates to a route you've declared you can handle. For custom routes, you'll typically
* add your own content and for built in routes, you'll typically modify the existing content.
*
* Route ID's are path like strings with named parameters, for example: "/myroute/:someParamMyRouteNeeds"
*/
var Router = function(appId, driver, membraneMap){
	var members = {};
	memberMap.set(this, members);

	members.appId = appId;
	members.driver = driver;

	members.currentRouteViewDriver = null;

	members.allRoutesHandlerRegistry = new HandlerRegistry();

	members.customRoutes = [];
	members.customListRoutes = [];

	members.lastNativeRouteID = null;
	members.modifiedNativeNavItem = null;
	members.membraneMap = membraneMap;

	driver.getRouteViewDriverStream().onValue(_handleRouteViewChange, this, members);

	this.NativeRouteIDs = nativeRouteIDs;
	this.NativeListRouteIDs = nativeListRouteIDs;
	this.RouteTypes = routeTypes;

	members.listRouteHandlerRegistries = {};
	_.forOwn(this.NativeListRouteIDs, value => {
		members.listRouteHandlerRegistries[value] = new HandlerRegistry();
	});

	driver.setNativeRouteIDs(this.NativeRouteIDs);
	driver.setNativeListRouteIDs(this.NativeListRouteIDs);
	driver.setRouteTypes(this.RouteTypes);
};

_.extend(Router.prototype, /** @lends Router */ {

	/**
	* Get a URL that can be used to navigate to a view. You'll typically want to use this to set the href of an <a> element or similar.
	* @param {string} routeID - a route specifying where the link should navigate the user to
	* @param {Object} params an object containing the parameters that will be encoded in the link and decoded when the user
	* subsequently visits the route. Handlers for the specified routeID will receive a copy of this object. This object must contain
	* only simple key value pairs with no nested arrays/objects.
	* @return {string} the encoded URL
	*/
	createLink: function(routeID, params){
		return memberMap.get(this).driver.createLink(routeID, params);
	},

	/**
	* Change the route to be the one with the given ID and have the given parameters
	* @param {string} routeID - a route specifying where the link should navigate the user to
	* @param {Object} params an object containing the parameters that will be encoded in the link and decoded when the user
	* subsequently visits the route. Handlers for the specified routeID will receive a copy of this object. This object must contain
	* only simple key value pairs with no nested arrays/objects.
	*/
	goto: function(routeID, params){
		memberMap.get(this).driver.goto(routeID, params);
	},

	/**
	* Registers a handler (callback) to be called when the user navigates to a custom route which matches the routeID you provide.
	* Use this to create your own routes (pages) with your own custom content. Your callback will be passed an instance of a
	* <code>CustomRouteView</code> which you can modify the content.
	* @param {string} routeID - which route this handler is registering for
	* @param {function(CustomRouteView)} handler - the callback to call when the route changes to a custom route matching
	* the provided routeID
	*/
	handleCustomRoute: function(routeID, handler){
		var customRouteDescriptor = {
			routeID: routeID,
			onActivate: handler
		};

		var customRoutes = memberMap.get(this).customRoutes;
		customRoutes.push(customRouteDescriptor);

		return function(){
			var index = customRoutes.indexOf(customRouteDescriptor);
			if(index > -1){
				customRoutes.splice(index, 1);
			}
		};
	},

	/**
	* Registers a handler (callback) to be called when the user navigates to any route (both customs and built in routes).
	* Because this can apply to any route, your callback will be given only a generic <code>RouteView</code>. This is typically used
	* when you want to monitor for page changes but don't necessarily need to modify the page.
	* @param {function(RouteView)} handler - the callback to call when the route changes
	*/
	handleAllRoutes: function(handler){
		return memberMap.get(this).allRoutesHandlerRegistry.registerHandler(handler);
	},

	/**
	* Registers a handler (callback) to be called when the user navigates to a list route which matches the routeID you provide.
	* Gmail and Inbox have several built in routes which are "Lists". These include routes like Inbox, All Mail, Sent, Drafts, etc.
	* You'll typically use this modify Gmail's and Inbox's built in List routes. Your callback will be passed an instance of a
	* <code>ListRouteView</code>
	* @param {string} routeID - which list route this handler is registering for. Permissible values are defined in <code>Router.NativeListRoutes</code>
	* @param {function(CustomRouteView)} handler - the callback to call when the route changes to a list route matching the routeId
	*/
	handleListRoute: function(routeID, handler){
		var listRouteHandlerRegistries = memberMap.get(this).listRouteHandlerRegistries;
		if(!listRouteHandlerRegistries[routeID]){
			throw new Error('Invalid routeID specified');
		}

		return listRouteHandlerRegistries[routeID].registerHandler(handler);
	},

	handleCustomListRoute: function(routeID, handler) {
		var customListRouteDescriptor = {
			routeID: routeID,
			onActivate: handler
		};

		var customListRoutes = memberMap.get(this).customListRoutes;
		customListRoutes.push(customListRouteDescriptor);

		return function() {
			var index = customListRoutes.indexOf(customListRouteDescriptor);
			if(index > -1){
				customListRoutes.splice(index, 1);
			}
		};
	},

	getCurrentRouteView: function(){
		var members = memberMap.get(this);

		return members.membraneMap.get(members.currentRouteViewDriver);
	}

});

/**
* All the different route types that exist in Gmail/Inbox
* @class
* @name NativeRouteIDs
*/
var nativeRouteIDs = Object.freeze(/** @lends NativeRouteIDs */ {
	/**
	* inbox list
	* @type string
	*/
	'INBOX': 'inbox/:page',

	/**
	* all mail list
	* @type string
	*/
	'ALL_MAIL': 'all/:page',

	/**
	* sent list
	* @type string
	*/
	'SENT': 'sent/:page',

	/**
	* starred list
	* @type string
	*/
	'STARRED': 'starred/:page',

	/**
	* drafts list
	* @type string
	*/
	'DRAFTS': 'drafts/:page',

	/**
	* any label list
	* @type string
	*/
	'LABEL': 'label/:labelName/:page',

	/**
	* trash list
	* @type string
	*/
	'TRASH': 'trash/:page',

	/**
	* spam list
	* @type string
	*/
	'SPAM': 'spam/:page',

	/**
	* built in list of important emails
	* @type string
	*/
	'IMPORTANT': 'imp/p:page',

	/**
	* any search results page
	* @type string
	*/
	'SEARCH': 'search/:query/:page',

	/**
	* single conversation view
	* @type string
	*/
	'THREAD': 'inbox/:threadID',

	/**
	* list of chats
	* @type string
	*/
	'CHATS': 'chats/:page',

	/**
	* single chat view
	* @type string
	*/
	'CHAT': 'chats/:chatID',

	/**
	* google contacts view
	* @type string
	*/
	'CONTACTS': 'contacts/:page',

	/**
	* single google contact view
	* @type string
	*/
	'CONTACT': 'contacts/:contactID',

	/**
	* the settings view
	* @type string
	*/
	'SETTINGS': 'settings/:section',

	/**
	* this refers to any of the above lists
	* @type string
	*/
	'ANY_LIST': '*'
});

/**
* The different list routes natively available in Gmail/Inbox. List routes display lists of threads or messages or other types.
* @class
* @name NativeListRouteIDs
*/
var nativeListRouteIDs = Object.freeze(/** @lends NativeListRouteIDs */ {
	/**
	* inbox list
	* @type string
	*/
	'INBOX': nativeRouteIDs.INBOX,

	/**
	* all mail list
	* @type string
	*/
	'ALL_MAIL': nativeRouteIDs.ALL_MAIL,

	/**
	* sent list
	* @type string
	*/
	'SENT': nativeRouteIDs.SENT,

	/**
	* starred list
	* @type string
	*/
	'STARRED': nativeRouteIDs.STARRED,

	/**
	* drafts list
	* @type string
	*/
	'DRAFTS': nativeRouteIDs.DRAFTS,

	/**
	* label list
	* @type string
	*/
	'LABEL': nativeRouteIDs.LABEL,

	/**
	* trash list
	* @type string
	*/
	'TRASH': nativeRouteIDs.TRASH,

	/**
	* spam list
	* @type string
	*/
	'SPAM': nativeRouteIDs.SPAM,

	/**
	* important list
	* @type string
	*/
	'IMPORTANT': nativeRouteIDs.IMPORTANT,

	/**
	* any search result list
	* @type string
	*/
	'SEARCH': nativeRouteIDs.SEARCH,

	/**
	* This refers to any of the above lists
	* @type string
	*/
	'ANY_LIST': nativeRouteIDs.ANY_LIST
});

/**
* The different route types that exist
* @class
* @name RouteTypes
*/
var routeTypes = Object.freeze(/** @lends RouteTypes */ {
	/**
	* a list of threads or messages
	* @type string
	*/
	'LIST': 'LIST',

	/**
	* a single thread or message
	* @type string
	*/
	'THREAD': 'THREAD',

	/**
	* a Gmail or Inbox settings
	* @type string
	*/
	'SETTINGS': 'SETTINGS',

	/**
	* a single chat history
	* @type string
	*/
	'CHAT': 'CHAT',

	/**
	* a custom route created by any app
	* @type string
	*/
	'CUSTOM': 'CUSTOM',

	/**
	* an unknown route
	* @type string
	*/
	'UNKNOWN': 'UNKNOWN'

});


function _handleRouteViewChange(router, members, routeViewDriver){
	_updateNavMenu(members, routeViewDriver);

	if(members.currentRouteViewDriver){
		if(_isSameRoute(members.currentRouteViewDriver, routeViewDriver)){
			return;
		}

		members.currentRouteViewDriver.destroy();
	}

	members.currentRouteViewDriver = routeViewDriver;
	var routeView = new RouteView(routeViewDriver, members.driver, members.appId);

	members.membraneMap.set(routeViewDriver, routeView);

	if(routeView.getRouteType() === router.RouteTypes.CUSTOM){
		_informRelevantCustomRoutes(members, routeViewDriver, routeView);
	}
	else{
		members.driver.showNativeRouteView();
	}

	members.pendingSearchResultsView = null;
	members.allRoutesHandlerRegistry.addTarget(routeView);

	if(routeView.getRouteType() === routeTypes.LIST){
		var listRouteView = new ListRouteView(routeViewDriver, members.driver, members.appId);

		members.listRouteHandlerRegistries[routeView.getRouteID()].addTarget(listRouteView);
		members.listRouteHandlerRegistries[router.NativeRouteIDs.ANY_LIST].addTarget(listRouteView);
	}
}

function _isSameRoute(currentRouteViewDriver, routeViewDriver){
	return currentRouteViewDriver.getRouteType() === routeViewDriver.getRouteType() &&
			currentRouteViewDriver.getRouteID() === routeViewDriver.getRouteID() &&
			_.isEqual(currentRouteViewDriver.getParams() === routeViewDriver.getParams());
}


function _informRelevantCustomRoutes(members, routeViewDriver, routeView){
	const relevantCustomRoutes = members.customRoutes.filter(customRoute => {
		if(!customRoute.routeID){
			return false;
		}

		if(_.isArray(customRoute.routeID)){
			return _.any(customRoute.routeID, function(routeID){
				return routeViewDriver.doesMatchRouteID(routeID);
			});
		}

		return routeViewDriver.doesMatchRouteID(customRoute.routeID);
	});

	if (relevantCustomRoutes.length) {
		const customRouteView = new CustomRouteView(routeViewDriver);

		relevantCustomRoutes.forEach(customRoute => {
			if(_.isArray(customRoute.routeID)){
				routeViewDriver.setCustomRouteID(
					_.find(customRoute.routeID, routeID => routeViewDriver.doesMatchRouteID(routeID))
				);
			}else{
				routeViewDriver.setCustomRouteID(customRoute.routeID);
			}

			try {
				members.driver.showCustomRouteView(routeViewDriver.getCustomViewElement());
				customRoute.onActivate(customRouteView);
			} catch(err) {
				members.driver.getLogger().error(err);
			}

		});
	} else {
		const relevantCustomListRoute = _.find(members.customListRoutes, customListRoute => {
			if(!customListRoute.routeID){
				return false;
			}

			if(_.isArray(customListRoute.routeID)){
				return _.any(customListRoute.routeID, routeID => routeViewDriver.doesMatchRouteID(routeID));
			}

			return routeViewDriver.doesMatchRouteID(customListRoute.routeID);
		});

		if (relevantCustomListRoute) {
			try {
				members.driver.showCustomThreadList(relevantCustomListRoute.onActivate);
			} catch(err) {
				members.driver.getLogger().error(err);
			}
		}
	}
}


function _updateNavMenu(members, newRouteViewDriver){
	var oldRouteViewDriver = members.currentRouteViewDriver;

	if(oldRouteViewDriver && oldRouteViewDriver.getRouteType() !== routeTypes.CUSTOM){
		if(newRouteViewDriver.getRouteType() === routeTypes.CUSTOM){
			members.lastNativeRouteID = oldRouteViewDriver.getRouteID();
			_removeNativeNavItemActive(members);
			return;
		}
	}
	else if(members.lastNativeRouteID && newRouteViewDriver.getRouteType() !== routeTypes.CUSTOM){
		if(members.lastNativeRouteID === newRouteViewDriver.getRouteID()){
			_restoreNativeNavItemActive(members);
		}
		else{
			_unhandleNativeNavItem(members);
		}
	}
}


function _removeNativeNavItemActive(members){
	if(members.modifiedNativeNavItem){
		members.modifiedNativeNavItem.setActive(false); //make sure there is only one active at a time;
	}

	members.modifiedNativeNavItem = members.driver.getCurrentActiveNavItem();

	if(!members.modifiedNativeNavItem){
		return;
	}

	members.modifiedNativeNavItem.setActive(false);
	members.modifiedNativeNavItem
		.getEventStream()
		.filter(function(event){
			return event.eventName === 'invalidated';
		})
		.onValue(_removeNativeNavItemActive, members);
}

function _restoreNativeNavItemActive(members){
	if(!members.modifiedNativeNavItem){
		return;
	}

	members.modifiedNativeNavItem.setActive(true);
	members.modifiedNativeNavItem = null;
}

function _unhandleNativeNavItem(members){
	members.modifiedNativeNavItem = null;
}


module.exports = Router;
