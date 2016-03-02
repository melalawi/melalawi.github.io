/*
 * Unofficial Ultimate Guitar Enhancer - Avatar Image code excerpt.
 * http://melalawi.github.io/codeSamples/avatar.js
 *
 * Implements swapping of forum avatar urls.
 * Written by Mohamed El-Alawi
 *
 * LICENSE: MIT
*/

'use strict';

(function(){ 
	function Avatar(inputNode) {
		var imageNode = inputNode;
		var successfullyLoaded = false;
		var defaultImageSrc = null;
		var customImageSrc = null;

		/*
		Global Function setCustomImageSrc(String)
		Does a HEAD request of the provided url to make sure it abides by file size standard.
		If source provided leads to a valid image, store it for use later.
		*/
		this.setCustomImageSrc = function(newSrc) {
			var success = function(xmlRequest) {
				// Checking if image and if it's not too larger
				var isImage = xmlRequest.getResponseHeader('Content-Type').indexOf('image') > -1;
				var validSize = xmlRequest.getResponseHeader('Content-Length') <= UUGE_LIB.CONSTANTS.MAX_AVATAR_FILE_SIZE;
				
				// Only 
				if (isImage && validSize) {
					customImageSrc = newSrc;
				} else {
					customImageSrc = null;
				}
			};
			var failure = function(xmlRequest) {
				// Reset customImageSrc if it leads to a bad image (or no image)
				customImageSrc = null;
			};
			
			UUGE_LIB.xmlRequest('head', newSrc, success, failure);
		};

		/*
		Function initialize()
		Store our default Image Src for swapping later.
		We also assign our onLoad function to the <img> node here.
		Don't bother if we were handed
		*/
		function initialize() {
			if (imageNode && imageNode instanceof HTMLImageElement) {
				defaultImageSrc = imageNode.src;

				setLoadEvent();
			}
		}

		/*
		Function setLoadEvent()
		Assigns functions that will be called when avatar loads/fails to load.
		Occurs once within the lifetime of the avatar.
		*/
		function setLoadEvent() {
			if (imageNode.complete) {
				onAvatarLoad();
			} else {
				imageNode.addEventListener('load', onAvatarLoad);
				imageNode.addEventListener('error', failedToLoad);
			}
		}
		
		/*
		Function onAvatarLoad()
		Called every time the avatar image finishes loading -successfully-
		Scales the image within the defined constant dimensions whilst maintaining aspect ratio.
		*/
		function onAvatarLoad() {		
			var scaledDimensions = UUGE_LIB.scaleImage(imageNode.naturalWidth, imageNode.naturalHeight, UUGE_LIB.CONSTANTS.MAX_AVATAR_WIDTH, UUGE_LIB.CONSTANTS.MAX_AVATAR_HEIGHT, UUGE_SETTINGS.getVariable('scaleUpSmallAvatars'));
			
			imageNode.width = scaledDimensions.width;
			imageNode.height = scaledDimensions.height;
			
			successfullyLoaded = true;
		}
		
		/*
		Function failedToLoad()
		Called every time the avatar image fails to load successfully.
		If the custom image src was the one that failed to load, revert to the default image src
		Otherwise, remove the src attribute and ignore this avatar.
		*/
		function failedToLoad() {
			//console.log('Error: Avatar failed to load: "' + imageNode.src + '"');
			if (imageNode.src === customImageSrc) {
				imageNode.src = defaultImageSrc;
			} else {
				imageNode.removeAttribute('src');
				successfullyLoaded = false;
			}
		}

		/*
		Global Function swapToCustomImageSrc(boolean)
		Swaps betweeen custom/default image sources.
		*/
		this.swapToCustomImageSrc = function(useCustomImageSrc) {
			if (successfullyLoaded === true) {
				// Only using == because we only want a true boolean parameter to swap back to Custom Image Src
				var newSrc = useCustomImageSrc == true && customImageSrc != null ? customImageSrc : defaultImageSrc;
				
				imageNode.src = newSrc;
			}
		}
		
		initialize();
	}

})();
/*
Elsewhere...
*/
	
'use strict';

var UUGE_LIB = (function(){
	// Various constants of the extension.
	this.CONSTANTS = {
		MAX_AVATAR_WIDTH: 175,
		MAX_AVATAR_HEIGHT: 256,
		MAX_AVATAR_FILE_SIZE: 5242880 // 5 megabytes
		//...
		TIMEOUT: 5000 // Generous 5 seconds time limit
	};
	
	this.ajaxRequest = function(type, url, onSuccess, onFailure) {
		var xmlRequest = new XMLHttpRequest();
		
		xmlRequest.timeout = UUGE_LIB.CONSTANTS.TIMEOUT;
		xmlRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				// Success
				if (this.status === 200) {
					onSuccess(this);
				} else {
					onFailure(this);
				}
			}
		};
		// Also fail on timeout
		xmlRequest.ontimeout = function () {
			onFailure(xmlRequest);
		};
		
		xmlRequest.open(type, url);
		xmlRequest.send();
	};

	/*
	Global Function scaleImage(integer, integer, integer, integer, boolean)
	Scales the given dimensions of an image to fit provided dimensions.
	We also scale up images smaller than the provided dimensions if scaleUpFlag is true.
	*/
	this.scaleImage = function(imageWidth, imageHeight, maxWidth, maxHeight, scaleUpFlag) {
		var imageRatio = 1;

		// Calculate the ratio difference if we need to (only when image is larger than container on either side, or scaleUpFlag == true)
		if (imageWidth >= maxWidth || imageHeight >= largerHeight || scaleUpFlag == true) {
			imageRatio = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
		}

		// Rounding because, for our simple purposes, subpixels don't matter.
		return {
			width: Math.round(imageWidth * imageRatio),
			height: Math.round(imageHeight * imageRatio)
		};
	};
	
})();

/*
Elsewhere...
*/
	
'use strict';

var UUGE_SETTINGS = (function(){
	// Dictionary of user-defined settings.
	var settingsDictionary = {
		//...
		scaleUpSmallAvatars: {
			type: 'boolean',
			defaultValue: false,
			assignedValue: true
		}
		//...
	};
	
	/*
	Global Function getVariable(string)
	Searches the settings dictionary for the provided variable name and returns its currently assigned value.
	Returns false if not found.
	*/
	this.getVariable = function(name) {
		var result = false;
		
		if (settingsDictionary.hasOwnProperty(name)) {
			result = settingsDictionary[name].assignedValue;
		}
		
		return result;
	};

})();
