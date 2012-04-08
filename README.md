This is a very early work-in-progress project to bring the
HTML5 parsing algorithm to any ECMAScript 3 environment.

The goals of the project are:

* Tokenizes and parses HTML using the HTML5 algorithm
* Does not require ES5; works in any ECMAScript 3 environment
* Specifically, is designed for use in a browser environment
* At least for now, code structure that is similar to the text
  of the parser spec
* Correctness first, performance later
  * Once the parser is correct, good performance will be a
    critical goal.
* Ability to prototype new features like `<template>` as a
  polyfill for existing browsers.
