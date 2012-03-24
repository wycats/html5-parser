var EOF = "";
var REPLACEMENT = "\ufffd";
var NULL = "\x00";
var TAB = "\t";
var LINEFEED = "\n";
var FORMFEED = "\u000c";
var SPACE = " ";
var ANYSPACE = /[\t\n\u000c ]/;

var Tk = function() {};
Tk.prototype = {
  toString: function() {
    var attrs = [this.name];

    for (var prop in this) {
      if (this.hasOwnProperty(prop) && prop !== "name") {
        attrs.push(prop + "=\"" + this[prop] + "\"");
      }
    }

    return "{" + attrs.join(" ") + "}";
  },

  finalize: function() {},

  toTest: function() {
    return [ this.testName ];
  }
};

var TkError = function(from, to) {
  this.from = from;
  this.to = to;
};
TkError.prototype = Object.create(Tk.prototype);
TkError.prototype.toTest = function() {
  return "ParseError";
};

var TkDOCTYPE = function() {
  this.name = this.missing;
  this.publicIdentifier = this.missing;
  this.systemIdentifier = this.missing;
  this.forceQuirks = this.missing;
};
TkDOCTYPE.prototype = Object.create(Tk.prototype);
TkDOCTYPE.prototype.missing = {};

var TkChar = function(data) { this.data = data; };
TkChar.prototype = Object.create(Tk.prototype);
TkChar.prototype.name = "Character";
TkChar.prototype.toTest = function() {
  return [ "Character", this.data ];
};

var TkEOF = function() {};
TkEOF.prototype = Object.create(Tk.prototype);
TkEOF.prototype.name = "EOF";

var TkTag = function(tagName) {
  this.tagName = tagName;
  this.attributes = {};
  this.selfClosing = false;
};
TkTag.prototype = Object.create(Tk.prototype);
TkTag.prototype.addChars = function(chars) {
  this.tagName += chars;
};

var TkStartTag = function(tagName) {
  TkTag.call(this, tagName);
};
TkStartTag.prototype = Object.create(TkTag.prototype);
TkStartTag.prototype.name = "StartTag";
TkStartTag.prototype.newAttribute = function(name) {
  if (this.attributeName) {
    this.attributes[this.attributeName] = this.attributeValue;
  }

  this.attributeName = name;
  this.attributeValue = "";
};
TkStartTag.prototype.pushAttributeName = function(char) {
  this.attributeName += char;
};
TkStartTag.prototype.pushAttributeValue = function(char) {
  this.attributeValue += char;
};
TkStartTag.prototype.finalize = function() {
  if (this.attributeName) {
    this.attributes[this.attributeName] = this.attributeValue;
    delete this.attributeName;
    delete this.attributeValue;
  }
};
TkStartTag.prototype.toTest = function() {
  var tag = [ "StartTag", this.tagName, this.attributes ];

  if (this.selfClosing) { tag.push(true); }

  return tag;
};

var TkEndTag = function(tagName) {
  TkTag.call(this, tagName);
};
TkEndTag.prototype = Object.create(TkTag.prototype);
TkEndTag.prototype.name = "endTag";
TkEndTag.prototype.newAttribute = function() {};
TkEndTag.prototype.pushAttributeName = function() {};
TkEndTag.prototype.pushAttributeValue = function() {};
TkEndTag.prototype.toTest = function() {
  return [ "EndTag", this.tagName ];
};

var TkComment = function() {
  this.data = "";
};
TkComment.prototype = Object.create(Tk.prototype);
TkComment.prototype.name = "comment";
TkComment.prototype.addChars = function(chars) {
  this.data += chars;
};
TkComment.prototype.toTest = function() {
  return [ "Comment", this.data ];
};

var states = {};

states.data = {
  toString: function() { return "data"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "&":
          lexer.setState('charRefInData');
          break;
        case "<":
          lexer.setState('tagOpen');
          break;
        case NULL:
          lexer.parseError();
          lexer.setToken(TkChar, next);
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.setToken(TkEOF);
          lexer.emitCurrentToken();
          break;
        default:
          lexer.setToken(TkChar, next);
          lexer.emitCurrentToken();
      }
    });
  }
};

states.charRefInData = {
  toString: function() { return "charRefInData"; },

  consume: function(lexer) {
  }
};

states.RCDATA = {
  toString: function() { return "RCDATA"; },

  consume: function(lexer) {
  }
};

states.charRefInRCDATA = {
  toString: function() { return "charRefInRCDATA"; },

  consume: function(lexer) {
  }
};

states.RAWTEXT = {
  toString: function() { return "RAWTEXT"; },

  consume: function(lexer) {
  }
};

states.scriptData = {
  toString: function() { return "scriptData"; },

  consume: function(lexer) {
  }
};

states.PLAINTEXT = {
  toString: function() { return "PLAINTEXT"; },

  consume: function(lexer) {
  }
};

states.tagOpen = {
  toString: function() { return "tagOpen"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      if (next === "!") {
        lexer.setState('markupDeclarationOpen');
      } else if (next === "/") {
        lexer.setState('endTagOpen');
      } else if (/[A-Za-z]/.test(next)) {
        lexer.setState('tagName');
        lexer.setToken(TkStartTag, next.toLowerCase());
      } else if (next === "?") {
        lexer.errorState('bogusComment');
      } else {
        lexer.errorState('data');
        lexer.setToken(TkChar, "<");
      }
    });
  }
};

states.endTagOpen = {
  toString: function() { return "endTagOpen"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      if (/[A-Za-z]/.test(next)) {
        lexer.setState('tagName');
        lexer.setToken(TkEndTag, next.toLowerCase());
      } else if (next === ">") {
        lexer.errorState('data');
      } else if (next === EOF) {
        lexer.errorState('data');
        tokens.push(new TkChar("<"));
        tokens.push(new TkChar("/"));
        lexer.reconsume();
      } else {
        lexer.errorState('bogusComment');
      }
    });
  }
};

states.tagName = {
  toString: function() { return "tagName"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      if (ANYSPACE.test(next)) {
        lexer.setState('beforeAttributeName');
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
      } else if (/[A-Z]/.test(next)) {
        token.addChars(next.toLowerCase());
      } else if (next === NULL) {
        lexer.parseError();
        token.addChars(REPLACEMENT);
      } else if (next === EOF) {
        lexer.errorState('data');
        lexer.reconsume();
      } else {
        token.addChars(next);
      }
    });
  }
};

states.RCDATALessThan = {
  toString: function() { return "RCDATALessThan"; },

  consume: function(lexer) {
  }
};

states.RCDATAEndTagOpen = {
  toString: function() { return "RCDATAEndTagOpen"; },

  consume: function(lexer) {
  }
};

states.RCDATAEndTagName = {
  toString: function() { return "RCDATAEndTagName"; },

  consume: function(lexer) {
  }
};

states.RAWTEXTLessThan = {
  toString: function() { return "RAWTEXTLessThan"; },

  consume: function(lexer) {
  }
};

states.RAWTEXTEndTagOpen = {
  toString: function() { return "RAWTEXTEndTagOpen"; },

  consume: function(lexer) {
  }
};

states.RAWTEXTEndTagName = {
  toString: function() { return "RAWTEXTEndTagName"; },

  consume: function(lexer) {
  }
};

states.scriptDataLessThan = {
  toString: function() { return "scriptDataLessThan"; },

  consume: function(lexer, token, tokens) {
    lexer.consume(function(next) {
      switch (next) {
        case "/":
          lexer.tmpBuffer = "";
          break;
        case "!":
          lexer.setState('scriptDataEscapeStart');
          lexer.pushToken(TkChar, "<");
          lexer.pushToken(TkChar, "!");
          break;
        default:
          lexer.setState('scriptData');
          lexer.setToken(TkChar, "<");
          lexer.emitCurrentToken();
          lexer.reconsume();
      }
    });
  }
};

states.scriptDataEndTagOpen = {
  toString: function() { return "scriptDataEndTagOpen"; },

  consume: function(lexer) {
    lexer.consume(function(next) {
      if (/[A-Za-z]/.test(next)) {
        lexer.setState('scriptDataEscapedEndTagName');
        lexer.tmpBuffer += next;
        lexer.setToken(TkEndTag, next.toLowerCase());
      } else {
        lexer.setState('scriptData');
        lexer.pushToken(TkChar, "<");
        lexer.pushToken(TkChar, "/");
      }
    });
  }
};

states.scriptDataEndTagName = {
  toString: function() { return "scriptDataEndTagName"; },

  consume: function(lexer) {
    var isAppropriate = lexer.isAppropriateEndTag();

    lexer.consume(function(next, token) {
      if (ANYSPACE.test(next) && isAppropriate) {
        lexer.setState('beforeAttribute');
      } else if (next === "/" && isAppropriate) {
        lexer.setState('selfClosingStartTag');
      } else if (next === ">" && isAppropriate) {
        lexer.setState('data');
        lexer.emitCurrentToken();
      } else if (/[A-Za-z]/.test(next)) {
        token.addChars(next.toLowerCase());
        lexer.tmpBuffer += next;
      } else {
        lexer.setState('scriptData');
        lexer.pushToken(TkChar, "<");
        lexer.pushToken(TkChar, "/");

        lexer.eachTmpBufferChar(function(char) {
          lexer.pushToken(TkChar, char);
        });

        lexer.reconsume();
      }
    });
  }
};

states.scriptDataEscapeStart = {
  toString: function() { return "scriptDataEscapeStart"; },

  consume: function(lexer) {
  }
};

states.scriptDataEscapeStartDash = {
  toString: function() { return "scriptDataEscapeStartDash"; },

  consume: function(lexer) {
  }
};

states.scriptDataEscaped = {
  toString: function() { return "scriptDataEscaped"; },

  consume: function(lexer) {
  }
};

states.scriptDataEscapedDash = {
  toString: function() { return "scriptDataEscapedDash"; },

  consume: function(lexer) {
  }
};

states.scriptDataEscapedDashDash = {
  toString: function() { return "scriptDataEscapedDashDash"; },

  consume: function(lexer) {
  }
};

states.scriptDataEscapedLessThan = {
  toString: function() { return "scriptDataEscapedLessThan"; },

  consume: function(lexer) {
  }
};

states.scriptDataEscapedEndTagOpen = {
  toString: function() { return "scriptDataEscapedEndTagOpen"; },

  consume: function(lexer) {
  }
};

states.scriptDataEscapedEndTagName = {
  toString: function() { return "scriptDataEscapedEndTagName"; },

  consume: function(lexer) {
  }
};

states.scriptDataDoubleEscapeStart = {
  toString: function() { return "scriptDataDoubleEscapeStart"; },

  consume: function(lexer) {
  }
};

states.scriptDataDoubleEscaped = {
  toString: function() { return "scriptDataDoubleEscaped"; },

  consume: function(lexer) {
  }
};

states.scriptDataDoubleEscapedDash = {
  toString: function() { return "scriptDataDoubleEscapedDash"; },

  consume: function(lexer) {
  }
};

states.scriptDataDoubleEscapedDashDash = {
  toString: function() { return "scriptDataDoubleEscapedDashDash"; },

  consume: function(lexer) {
  }
};

states.scriptDataDoubleEscapedLessThan = {
  toString: function() { return "scriptDataDoubleEscapedDashDash"; },

  consume: function(lexer) {
  }
};

states.scriptDataDoubleEscapeEnd = {
  toString: function() { return "scriptDataDoubleEscapeEnd"; },

  consume: function(lexer) {
  }
};

states.beforeAttributeName = {
  toString: function() { return "beforeAttributeName"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      if (ANYSPACE.test(next)) {
        // ignore
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
      } else if (/[A-Z]/.test(next)) {
        lexer.setState('attributeName');
        token.newAttribute(next.toLowerCase());
      } else if (next === NULL) {
        lexer.errorState('attributeName');
        token.newAttribute(REPLACEMENT);
      } else if (next === "\"" || next === "'" || next === "<" || next === "=") {
        // same as else below
        lexer.errorState('attributeName');
        token.newAttribute(next);
      } else if (next === EOF) {
        lexer.errorState('data');
      } else {
        lexer.setState('attributeName');
        token.newAttribute(next);
      }
    });
  }
};

states.attributeName = {
  toString: function() { return "attributeName"; },

  consume: function(lexer) {
    lexer.consume(function (next, token, tokens) {
      if (ANYSPACE.test(next)) {
        lexer.setState('afterAttributeName');
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === "=") {
        lexer.setState('beforeAttributeValue');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
      } else if (/[A-Z]/.test(next)) {
        token.attributeName += next;
      } else if (next === NULL) {
        lexer.parseError();
        token.attributeName += REPLACEMENT;
      } else if (next === "\"" || next === "'" || next === "<") {
        // same as else below
        lexer.parseError();
        token.attributeName += next;
      } else if (next === EOF) {
        lexer.errorState('data');
      } else {
        token.attributeName += next;
      }
    });
  }
};

states.afterAttributeName = {
  toString: function() { return "afterAttributeName"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      if (ANYSPACE.test(next)) {
        // ignore
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === "=") {
        lexer.setState('beforeAttributeValue');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
      } else if (/[A-Z]/.test(next)) {
        lexer.setState('attributeName');
        token.newAttribute(next.toLowerCase());
      } else if (next === NULL) {
        lexer.errorState('attributeName');
        token.newAttribute(REPLACEMENT);
      } else if (next === "\"" || next === "'" || next === "<") {
        // same as else below
        lexer.errorState('attributeName');
        token.newAttribute(next);
      } else if (next === EOF) {
        lexer.errorState('data');
      } else {
        lexer.setState('attributeName');
        token.newAttribute(next);
      }
    });
  }
};

states.beforeAttributeValue = {
  toString: function() { return "beforeAttributeValue"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case TAB:
        case LINEFEED:
        case FORMFEED:
        case SPACE:
          break;
        case "\"":
          lexer.setState('attributeValueDoubleQuoted');
          break;
        case "&":
          lexer.setState('attributeValueUnquoted');
          lexer.reconsume();
          break;
        case "'":
          lexer.setState('attributeValueSingleQuoted');
          break;
        case NULL:
        case ">":
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        case "<":
        case "=":
        case "`":
          lexer.errorState('attributeValueUnquoted');
          token.pushAttributeValue(next);
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          lexer.setState('attributeValueUnquoted');
          token.pushAttributeValue(next);
      }
    });
  }
};

states.attributeValueDoubleQuoted = {
  toString: function() { return "attributeValueDoubleQuoted"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "\"":
          lexer.setState('afterAttributeValueQuoted');
          break;
        case "&":
          // TODO: character reference in attribute value
          break;
        case NULL:
          lexer.parseError();
          token.pushAttributeValue(REPLACEMENT);
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          token.pushAttributeValue(next);
      }
    });
  }
};

states.attributeValueSingleQuoted = {
  toString: function() { return "attributeValueSingleQuoted"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "'":
          lexer.setState('afterAttributeValueQuoted');
          break;
        case "&":
          // TODO: character reference in attribute value
          break;
        case NULL:
          lexer.parseError();
          token.pushAttributeValue(REPLACEMENT);
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          token.pushAttributeValue(next);
      }
    });
  }
};

states.attributeValueUnquoted = {
  toString: function() { return "attributeValueUnquoted"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "\t":
        case "\n":
        case "\u000c":
        case " ":
          lexer.setState('beforeAttributeName');
          break;
        case "&":
          // TODO: character reference in attribute value
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case NULL:
          lexer.parseError();
          token.pushAttributeValue(REPLACEMENT);
          break;
        case "\"":
        case "'":
        case "<":
        case "=":
        case "`":
          lexer.parseError();
          token.pushAttributeValue(next);
          break;
        case EOF:
          lexer.setState('data');
          break;
        default:
          token.pushAttributeValue(next);
      }
    });
  }
};

states.charRefInAttributeValue = {
  toString: function() { return "charRefInAttributeValue"; },

  consume: function(lexer) {
  }
};

states.afterAttributeValueQuoted = {
  toString: function() { return "afterAttributeValueQuoted"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "\t":
        case "\n":
        case "\u000c":
        case " ":
          lexer.setState('beforeAttributeName');
          break;
        case "/":
          lexer.setState('selfClosingStartTag');
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          lexer.errorState('beforeAttributeName');
          lexer.reconsume();
      }
    });
  }
};

states.selfClosingStartTag = {
  toString: function() { return "selfClosingStartTag"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      switch (next) {
        case ">":
          lexer.setState('data');
          token.selfClosing = true;
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          lexer.errorState('beforeAttributeName');
          lexer.reconsume();
      }
    });
  }
};

states.bogusComment = {
  toString: function() { return "bogusComment"; },

  consume: function(lexer) {
  }
};

states.markupDeclarationOpen = {
  toString: function() { return "markupDeclarationOpen"; },

  consume: function(lexer) {
    if (lexer.peek(2) === "--") {
      lexer.getChars(2);
      lexer.setState('comment');
      lexer.setToken(TkComment);
    } else if (/DOCTYPE/i.test(lexer.peek(7))) {
      lexer.getChars(7);
      lexer.setState('DOCTYPE');
    } else if (false) /* TODO: current node, not in HTML namespace, matching CDATA */ {

    } else {
      lexer.errorState('bogusComment');
    }
  }
};

states.commentStart = {
  toString: function() { return "commentStart"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "-":
          lexer.setState('commentStartDash');
          break;
        case ">":
          lexer.parseError();
          token.addChars(REPLACEMENT);
          break;
        case EOF:
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        default:
          token.addChars(next);
      }
    });
  }
};

states.commentStartDash = {
  toString: function() { return "commentStart"; },

  consume: function(lexer) {
    lexer.consume(function() {
      switch (next) {
        case "-":
          lexer.setState('commentEnd');
          break;
        case NULL:
          lexer.errorState('comment');
          token.addChars("-" + REPLACEMENT);
          break;
        case ">":
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        default:
          lexer.setState('comment');
          token.addChars("-");
      }
    });
  }
};

states.comment = {
  toString: function() { return "commentStart"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      switch (next) {
        case "-":
          lexer.setState('commentEndDash');
          break;
        case NULL:
          lexer.parseError();
          token.addChars(REPLACEMENT);
          break;
        case EOF:
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        default:
          token.addChars(next);
      }
    });
  }
};

states.commentEndDash = {
  toString: function() { return "commentEndDash"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "-":
          lexer.setState('commentEnd');
          break;
        case NULL:
          lexer.errorState('comment');
          token.addChars("-" + REPLACEMENT);
          break;
        case EOF:
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        default:
          lexer.setState('comment');
          token.addChars("-");
      }
    });
  }
};

states.commentEnd = {
  toString: function() { return "commentEnd"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case NULL:
          lexer.errorState('comment');
          token.addChars("-" + REPLACEMENT);
          break;
        case "!":
          lexer.errorState('commentEndBang');
          break;
        case "-":
          lexer.parseError();
          lexer.addChars("-");
          break;
        case EOF:
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        default:
          lexer.errorState('comment');
          token.addChars("--" + next);
      }
    });
  }
};

states.commentEndBang = {
  toString: function() { return "commentEndBang"; },

  consume: function(lexer) {
    lexer.consume(function(next, token, tokens) {
      switch (next) {
        case "-":
          lexer.setState('commentEndDash');
          token.addChars("--!");
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case NULL:
          lexer.errorState('comment');
          token.addChars("--!");
          break;
        case EOF:
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        default:
          lexer.setState('comment');
          token.addChars("--!" + next);
      }
    });
  }
};

states.DOCTYPE = {
  toString: function() { return "DOCTYPE"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      if (ANYSPACE.test(next)) {
        lexer.setState('beforeDOCTYPEName');
      } else if (next === EOF) {
        lexer.errorState('data');
        lexer.setToken(TkDOCTYPE);
        lexer.token.forceQuirks = true;
        lexer.emitCurrentToken();
      } else {
        lexer.errorState('beforeDOCTYPEName');
        lexer.reconsume();
      }
    });
  }
};

states.beforeDOCTYPEName = {
  toString: function() { return "beforeDOCTYPEName"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      if (ANYSPACE.test(next)) {
        // ignore
      } else if (/[A-Z]/.test(next)) {
        lexer.setState('DOCTYPEName');
        lexer.setToken(TkDOCTYPE);
        lexer.token.name = next.toLowerCase();
      } else if (next === NULL) {
        lexer.errorState('DOCTYPEName');
        lexer.setToken(TkDOCTYPE);
        lexer.token.name = REPLACEMENT;
      } else if (next === ">") {
        lexer.errorState('data');
        lexer.setToken(TkDOCTYPE);
        lexer.token.forceQuirks = true;
        lexer.emitCurrentToken();
      } else if (next === EOF) {
        lexer.errorState('data');
        lexer.setToken(TkDOCTYPE);
        lexer.token.forceQuirks = true;
        lexer.emitCurrentToken();
      } else {
        lexer.setState('DOCTYPEName');
        lexer.setToken(TkDOCTYPE);
        lexer.token.name = next;
      }
    });
  }
};

states.DOCTYPEName = {
  toString: function() { return "DOCTYPEName"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      if (ANYSPACE.test(next)) {
        lexer.setState('afterDOCTYPEName');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
      } else if (/[A-Z]/.test(next)) {
        token.name += next.toLowerCase();
      } else if (next === NULL) {
        lexer.parseError();
        token.name += REPLACEMENT;
      } else if (next === EOF) {
        lexer.errorState('data');
        token.forceQuirks = true;
        lexer.emitCurrentToken();
      } else {
        token.name += next;
      }
    });
  }
};

states.afterDOCTYPEName = {
  toString: function() { return "afterDOCTYPE"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      if (ANYSPACE.test(next)) {
        // ignore
      } else if (next === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
      } else if (next === EOF) {
        lexer.errorState('data');
        token.forceQuirks = true;
        lexer.emitCurrentToken();
      } else {
        var nextSix = lexer.peek(6);

        if (/public/i.test(nextSix)) {
          lexer.getChars(6);
          lexer.setState('afterDOCTYPEPublicKeyword');
        } else if (/system/i.test(nextSix)) {
          lexer.getChars(6);
          lexer.setState('afterDOCTYPESystemKeyword');
        } else {
          lexer.errorState('bogusDOCTYPE');
          token.forceQuirks = true;
        }
      }
    });
  }
};

states.afterDOCTYPEPublicKeyword = {
  toString: function() { return "afterDOCTYPEPublicKeyword"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      switch (next) {
        case TAB:
        case LINEFEED:
        case FORMFEED:
        case SPACE:
          lexer.setState('beforeDOCTYPEPublicIdentifier');
          break;
        case "\"":
          lexer.errorState('DOCTYPEPublicIdentifierDoubleQuoted');
          break;
        case "'":
          lexer.errorState('DOCTYPEPublicIdentifierSingleQuoted');
          break;
        case ">":
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        default:
          lexer.errorState('bogusDOCTYPE');
          token.forceQuirks = true;
      }
    });
  }
};

states.beforeDOCTYPEPublicIdentifier = {
  toString: function() { return "beforeDOCTYPEPublicIdentifier"; },

  consume: function(lexer) {
    lexer.consume(function(next, token) {
      switch (next) {
        case TAB:
        case LINEFEED:
        case FORMFEED:
        case SPACE:
          // ignore
          break;
        case "\"":
          lexer.setState('DOCTYPEPublicIdentifierDoubleQuoted');
          token.publicIdentifier = "";
          break;
        case "'":
          lexer.setState('DOCTYPEPublicIdentifierSingleQuoted');
          token.publicIdentifier = "";
          break;
        case ">":
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        default:
          lexer.errorState('bogusDOCTYPE');
          token.forceQuirks = true;
      }
    });
  }
};

states.DOCTYPEPublicIdentifierDoubleQuoted = {
  toString: function() { return "DOCTYPEPublicIdentifierDoubleQuoted"; },

  consume: function(lexer) {
  }
};

states.DOCTYPEPublicIdentifierSingleQuoted = {
  toString: function() { return "DOCTYPEPublicIdentifierSingleQuoted"; },

  consume: function(lexer) {
  }
};

states.afterDOCTYPEPublicIdentifier = {
  toString: function() { return "afterDOCTYPEPublicIdentifier"; },

  consume: function(lexer) {
  }
};

states.betweenDOCTYPEPublicAndSystemIdentifier = {
  toString: function() { return "betweenDOCTYPEPublicAndSystemIdentifier"; },

  consume: function(lexer) {
  }
};

states.afterDOCTYPESystemKeyword = {
  toString: function() { return "afterDOCTYPESystemKeyword"; },

  consume: function(lexer) {
  }
};

states.beforeDOCTYPESystemIdentifier = {
  toString: function() { return "tagOpen"; },

  consume: function(lexer) {
  }
};

states.DOCTYPESystemIdentifierDoubleQuoted = {
  toString: function() { return "DOCTYPESystemIdentifierDoubleQuoted"; },

  consume: function(lexer) {
  }
};

states.DOCTYPESystemIdentifierSingleQuoted = {
  toString: function() { return "DOCTYPESystemIdentifierSingleQuoted"; },

  consume: function(lexer) {
  }
};

states.afterDOCTYPESystemIdentifier = {
  toString: function() { return "afterDOCTYPESystemIdentifier"; },

  consume: function(lexer) {
  }
};

states.bogusDOCTYPE = {
  toString: function() { return "bogusDOCTYPE"; },

  consume: function(lexer) {
  }
};

states.CDATASection = {
  toString: function() { return "CDATASection"; },

  consume: function(lexer) {
  }
};

Tokenizer = function(input, strict) {
  this.input = input;
  this.pos = 0;
  this.state = states.data;
  this.tokens = [];
  this.strict = strict || false;
};

Tokenizer.prototype = {
  lex: function() {
    var length = this.input.length;
    while (this.pos < length) {
      this.state.consume(this);
    }
  },

  parseError: function(toState) {
    if (this.strict) {
      msg = "Parse Error in " + this.state.toString() + " going to ";
      msg += toState || this.state.toString();
      msg += " tokens so far: " + this.tokens.map(function(token) { return token.toTest(); });
      throw msg;
    } else {
      this.tokens.push(new TkError(this.state.toString(), toState || this.state.toString()));
    }
  },

  consume: function(callback) {
    var next = this.getChar();
    callback(next, this.token, this.tokens);
  },

  setState: function(state) {
    this.state = states[state];
  },

  errorState: function(state) {
    this.parseError(state);
    this.setState(state);
  },

  setToken: function(token, param) {
    this.token = new token(param);
  },

  pushToken: function(token, param) {
    this.token = new token(param);
    this.emitCurrentToken();
  },

  eachTmpBufferChar: function(callback, binding) {
    var tmpBuffer = this.tmpBuffer;

    for (var i=0, l=tmpBuffer.length; i<l; i++) {
      callback.call(binding, tmpBuffer[i]);
    }
  },

  getChar: function() {
    return this.input.charAt(this.pos++);
  },

  getChars: function(n) {
    return this.input.slice(this.pos, this.pos += n);
  },

  reconsume: function() {
    this.pos--;
  },

  peek: function(n) {
    if (n) {
      return this.input.slice(this.pos, this.pos + n);
    } else {
      return this.input.charAt(this.pos);
    }
  },

  emitCurrentToken: function() {
    this.token.finalize();
    this.tokens.push(this.token);
    this.token = null;
  }
};

var input = "<div id='1' class=foo>hi</div><!-- hi --><p><!-- bye --></p><span style=zomg zomg>";
input = "<h a='b'c='d'><!-- foo -->bar";
var lexer = new Tokenizer(input);
lexer.lex();

console.log(lexer.tokens.map(function(token) { return token.toTest(); }));
