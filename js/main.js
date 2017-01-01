(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';


var sideElement;
var sidebar;


function init() {
    sideElement = document.getElementById('side');
    sidebar = document.getElementById('sidebar');

    document.getElementById('sidebarToggleButton').onclick = function() {
        if (sideElement.getAttribute('hidden') === 'true') {
            sideElement.style.marginLeft = '0px';

            sideElement.setAttribute('hidden', 'false');
        } else {
            var hiddenDistance = sidebar.offsetWidth;

            sideElement.style.marginLeft = '-' + hiddenDistance + 'px';

            sideElement.setAttribute('hidden', 'true');
        }
    };
}


document.addEventListener('DOMContentLoaded', init);
},{}]},{},[1]);
