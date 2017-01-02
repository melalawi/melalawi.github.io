(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';


var sidebar;
var togglebar;


function init() {
    sidebar = document.getElementById('side');
    togglebar = document.getElementById('togglebar');

    document.getElementById('sidebarToggleButton').onclick = function() {
        var marginLeft = window.getComputedStyle(sidebar).getPropertyValue('margin-left');

        console.log(marginLeft);

        if (marginLeft.indexOf('-') !== -1) {
            sidebar.style.marginLeft = '0';
            togglebar.className = 'right';
        } else {
            sidebar.style.marginLeft = '-100%';
            togglebar.className = 'left';
        }
    };
}

document.addEventListener('DOMContentLoaded', init);
},{}]},{},[1]);
