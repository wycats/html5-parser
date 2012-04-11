var EOF = "";
var REPLACEMENT = "\ufffd";
var NULL = "\x00";
var TAB = "\t";
var LINEFEED = "\n";
var FORMFEED = "\u000c";
var SPACE = " ";
var QUOTE = "\"";
var ANYSPACE = /[\t\n\u000c ]/;

var ENTITIES = require("entities.js");

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
    return [ this.name ];
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
  this.name = "";
  this.publicIdentifier = this.missing;
  this.systemIdentifier = this.missing;
  this.forceQuirks = this.missing;
};
TkDOCTYPE.prototype = Object.create(Tk.prototype);
TkDOCTYPE.prototype.missing = null;
TkDOCTYPE.prototype.toTest = function() {
  return ["DOCTYPE", this.name, this.publicIdentifier, this.systemIdentifier, !this.forceQuirks];
};

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
TkStartTag.prototype.newAttribute = function(name, lexer) {
  this.finalizeAttribute(lexer);

  this.attributeName = name;
  this.attributeValue = "";
};
TkStartTag.prototype.pushAttributeName = function(char) {
  this.attributeName += char.toLowerCase();
};
TkStartTag.prototype.pushAttributeValue = function(char) {
  this.attributeValue += char;
};
TkStartTag.prototype.finalizeAttribute = function(lexer) {
  if (this.attributeName) {
    if (this.attributes.hasOwnProperty(this.attributeName)) {
      lexer.tokens.push(new TkError("DuplicateAttribute"));
    } else {
      this.attributes[this.attributeName] = this.attributeValue;
    }

    delete this.attributeName;
    delete this.attributeValue;
  }
};
TkStartTag.prototype.finalize = function(lexer) {
  this.finalizeAttribute(lexer);
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
TkEndTag.prototype.newAttribute = function() {
  this.sawAttributes = true;
};
TkEndTag.prototype.pushAttributeName = function() {};
TkEndTag.prototype.pushAttributeValue = function() {};
TkEndTag.prototype.finalize = function(lexer) {
  if (this.sawAttributes) {
    lexer.tokens.push(new TkError("EndTag", "EndTag"));
  }
};
TkEndTag.prototype.toTest = function() {
  return [ "EndTag", this.tagName ];
};

var TkComment = function(data) {
  this.data = data || "";
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
  toString: function() { return 'data'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case "&":
          lexer.setState('charRefInData');
          break;
        case "<":
          lexer.setState('tagOpen');
          break;
        case NULL:
          lexer.parseError();
          lexer.setToken(TkChar, char);
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.setToken(TkEOF);
          lexer.emitCurrentToken();
          break;
        default:
          lexer.setToken(TkChar, char);
          lexer.emitCurrentToken();
          break;
      }
    });
  }
};
states.charRefInData = {
  toString: function() { return 'charRefInData'; },

  consume: function(lexer) {
    lexer.setState('data');
    var token = lexer.consumeCharacterReference();
    
    if (token) {
      lexer.pushToken(token);
    } else {
      lexer.pushToken(TkChar, "&");
    }
  }
};
states.tagOpen = {
  toString: function() { return 'tagOpen'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === "!") {
        lexer.setState('markupDeclarationOpen');
        return;
      }
      if (char === "/") {
        lexer.setState('endTagOpen');
        return;
      }
      if (/[A-Za-z]/.test(char)) {
        lexer.setState('tagName');
        lexer.setToken(TkStartTag, char.toLowerCase());
        return;
      }
      if (char === "?") {
        lexer.errorState('bogusComment');
        lexer.setToken(TkComment, char);
        return;
      }
      lexer.errorState('data');
      lexer.pushToken(TkChar, "<");
      lexer.reconsume();
    });
  }
};
states.endTagOpen = {
  toString: function() { return 'endTagOpen'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (/[A-Za-z]/.test(char)) {
        lexer.setState('tagName');
        lexer.setToken(TkEndTag, char.toLowerCase());
        return;
      }
      if (char === ">") {
        lexer.errorState('data');
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        lexer.pushToken(TkChar, "<");
        lexer.pushToken(TkChar, "/");
        return;
      }
      lexer.errorState('bogusComment');
      lexer.setToken(TkComment, char);
    });
  }
};
states.tagName = {
  toString: function() { return 'tagName'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        lexer.setState('beforeAttributeName');
        return;
      }
      if (char === "/") {
        lexer.setState('selfClosingStartTag');
        return;
      }
      if (char === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
        return;
      }
      if (/[A-Z]/.test(char)) {
        token.addChars(char.toLowerCase());
        return;
      }
      if (char === NULL) {
        lexer.parseError();
        token.addChars(REPLACEMENT);
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        return;
      }
      token.addChars(char);
    });
  }
};
states.beforeAttributeName = {
  toString: function() { return 'beforeAttributeName'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        return;
      }
      if (char === "/") {
        lexer.setState('selfClosingStartTag');
        return;
      }
      if (char === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
        return;
      }
      if (/[A-Z]/.test(char)) {
        lexer.setState('attributeName');
        token.newAttribute(char.toLowerCase(), lexer);
        return;
      }
      if (char === NULL) {
        lexer.errorState('attributeName');
        token.newAttribute(REPLACEMENT, lexer);
        return;
      }
      if (/["'<=]/.test(char)) {
        lexer.errorState('attributeName');
        token.newAttribute(char, lexer);
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        return;
      }
      lexer.setState('attributeName');
      token.newAttribute(char, lexer);
    });
  }
};
states.attributeName = {
  toString: function() { return 'attributeName'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        lexer.setState('afterAttributeName');
        return;
      }
      if (char === "/") {
        lexer.setState('selfClosingStartTag');
        return;
      }
      if (char === "=") {
        lexer.setState('beforeAttributeValue');
        return;
      }
      if (char === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
        return;
      }
      if (/[A-Z]/.test(char)) {
        token.pushAttributeName(char);
        return;
      }
      if (char === NULL) {
        lexer.parseError();
        token.pushAttributeName(REPLACEMENT);
        return;
      }
      if (/["'<]/.test(char)) {
        lexer.parseError();
        token.pushAttributeName(char);
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        return;
      }
      token.pushAttributeName(char);
    });
  }
};
states.afterAttributeName = {
  toString: function() { return 'afterAttributeName'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        return;
      }
      if (char === "/") {
        lexer.setState('selfClosingStartTag');
        return;
      }
      if (char === "=") {
        lexer.setState('beforeAttributeValue');
        return;
      }
      if (char === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
        return;
      }
      if (/[A-Z]/.test(char)) {
        lexer.setState('attributeName');
        token.newAttribute(char.toLowerCase(), lexer);
        return;
      }
      if (char === NULL) {
        lexer.errorState('attributeName');
        token.newAttribute(REPLACEMENT, lexer);
        return;
      }
      if (/["'<]/.test(char)) {
        lexer.errorState('attributeName');
        token.newAttribute(char, lexer);
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        return;
      }
      lexer.setState('attributeName');
      token.newAttribute(char, lexer);
    });
  }
};
states.beforeAttributeValue = {
  toString: function() { return 'beforeAttributeValue'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        return;
      }
      if (char === QUOTE) {
        lexer.setState('attributeValueDoubleQuoted');
        return;
      }
      if (char === "&") {
        lexer.setState('attributeValueUnquoted');
        lexer.reconsume();
        return;
      }
      if (char === "'") {
        lexer.setState('attributeValueSingleQuoted');
        return;
      }
      if (char === NULL) {
        lexer.errorState('attributeValueUnquoted');
        token.pushAttributeValue(REPLACEMENT);
        return;
      }
      if (char === ">") {
        lexer.errorState('data');
        lexer.emitCurrentToken();
        return;
      }
      if (/[<=`]/.test(char)) {
        lexer.errorState('attributeValueUnquoted');
        token.pushAttributeValue(char);
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        return;
      }
      lexer.setState('attributeValueUnquoted');
      token.pushAttributeValue(char);
    });
  }
};
states.attributeValueDoubleQuoted = {
  toString: function() { return 'attributeValueDoubleQuoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case QUOTE:
          lexer.setState('afterAttributeValueQuoted');
          break;
        case "&":
          lexer.setState('charRefInAttributeValue');
          break;
        case NULL:
          lexer.parseError();
          token.pushAttributeValue(REPLACEMENT);
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          token.pushAttributeValue(char);
          break;
      }
    });
  }
};
states.attributeValueSingleQuoted = {
  toString: function() { return 'attributeValueSingleQuoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case "'":
          lexer.setState('afterAttributeValueQuoted');
          break;
        case "&":
          lexer.setState('charRefInAttributeValue');
          break;
        case NULL:
          lexer.parseError();
          token.pushAttributeValue(REPLACEMENT);
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          token.pushAttributeValue(char);
          break;
      }
    });
  }
};
states.attributeValueUnquoted = {
  toString: function() { return 'attributeValueUnquoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        lexer.setState('beforeAttributeName');
        return;
      }
      if (char === "&") {
        lexer.setState('charRefInAttributeValue');
        return;
      }
      if (char === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
        return;
      }
      if (char === NULL) {
        lexer.parseError();
        token.pushAttributeValue(REPLACEMENT);
        return;
      }
      if (/["'<=`]/.test(char)) {
        lexer.parseError();
        token.pushAttributeValue(char);
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        return;
      }
      token.pushAttributeValue(char);
    });
  }
};
states.charRefInAttributeValue = {
  toString: function() { return 'charRefInAttributeValue'; },

  consume: function(lexer) {
    lexer.setState('data');
    // This doesn't currently work
    // TODO: specify the "allowed extra char"
    // TODO: implement a history symbol
    var token = lexer.consumeCharacterReference();
    
    if (token) {
      lexer.pushToken(token);
    } else {
      lexer.pushToken(TkChar, "&");
    }
  }
};
states.afterAttributeValueQuoted = {
  toString: function() { return 'afterAttributeValueQuoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
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
          break;
      }
    });
  }
};
states.selfClosingStartTag = {
  toString: function() { return 'selfClosingStartTag'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
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
          break;
      }
    });
  }
};
states.bogusComment = {
  toString: function() { return 'bogusComment'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case NULL:
          token.addChars(REPLACEMENT);
          break;
        case EOF:
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        default:
          token.addChars(char);
          break;
      }
    });
  }
};
states.markupDeclarationOpen = {
  toString: function() { return 'markupDeclarationOpen'; },

  consume: function(lexer) {
    if (lexer.peek(2) === "--") {
      lexer.getChars(2);
      lexer.setState('commentStart');
      lexer.setToken(TkComment);
    } else if (/DOCTYPE/i.test(lexer.peek(7))) {
      lexer.getChars(7);
      lexer.setState('DOCTYPE');
    } else if (false) /* TODO: current node, not in HTML namespace, matching CDATA */ {
    
    } else {
      lexer.errorState('bogusComment');
      lexer.setToken(TkComment);
    }
  }
};
states.commentStart = {
  toString: function() { return 'commentStart'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case "-":
          lexer.setState('commentStartDash');
          break;
        case NULL:
          lexer.errorState('comment');
          token.addChars(REPLACEMENT);
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
          token.addChars(char);
          break;
      }
    });
  }
};
states.commentStartDash = {
  toString: function() { return 'commentStartDash'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
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
          token.addChars("-" + char);
          break;
      }
    });
  }
};
states.comment = {
  toString: function() { return 'comment'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
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
          token.addChars(char);
          break;
      }
    });
  }
};
states.commentEndDash = {
  toString: function() { return 'commentEndDash'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
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
          token.addChars("-" + char);
          break;
      }
    });
  }
};
states.commentEnd = {
  toString: function() { return 'commentEnd'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
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
          token.addChars("-");
          break;
        case EOF:
          lexer.errorState('data');
          lexer.emitCurrentToken();
          break;
        default:
          lexer.errorState('comment');
          token.addChars("--" + char);
          break;
      }
    });
  }
};
states.commentEndBang = {
  toString: function() { return 'commentEndBang'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
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
          token.addChars("--!" + char);
          break;
      }
    });
  }
};
states.DOCTYPE = {
  toString: function() { return 'DOCTYPE'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          lexer.setState('beforeDOCTYPEName');
          break;
        case EOF:
          lexer.errorState('data');
          lexer.setToken(TkDOCTYPE);
          lexer.token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        default:
          lexer.errorState('beforeDOCTYPEName');
          lexer.reconsume();
          break;
      }
    });
  }
};
states.beforeDOCTYPEName = {
  toString: function() { return 'beforeDOCTYPEName'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        return;
      }
      if (/[A-Z]/.test(char)) {
        lexer.setState('DOCTYPEName');
        lexer.setToken(TkDOCTYPE);
        lexer.token.name = char.toLowerCase();
        return;
      }
      if (char === NULL) {
        lexer.errorState('DOCTYPEName');
        lexer.setToken(TkDOCTYPE);
        lexer.token.name = REPLACEMENT;
        return;
      }
      if (char === ">") {
        lexer.errorState('data');
        lexer.setToken(TkDOCTYPE);
        lexer.token.forceQuirks = true;
        lexer.emitCurrentToken();
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        lexer.setToken(TkDOCTYPE);
        lexer.token.forceQuirks = true;
        lexer.emitCurrentToken();
        return;
      }
      lexer.setState('DOCTYPEName');
      lexer.setToken(TkDOCTYPE);
      lexer.token.name = char;
    });
  }
};
states.DOCTYPEName = {
  toString: function() { return 'DOCTYPEName'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      if (char === SPACE) {
        lexer.setState('afterDOCTYPEName');
        return;
      }
      if (char === ">") {
        lexer.setState('data');
        lexer.emitCurrentToken();
        return;
      }
      if (/[A-Z]/.test(char)) {
        token.name += char.toLowerCase();
        return;
      }
      if (char === NULL) {
        lexer.parseError();
        token.name += REPLACEMENT;
        return;
      }
      if (char === EOF) {
        lexer.errorState('data');
        token.forceQuirks = true;
        lexer.emitCurrentToken();
        return;
      }
      token.name += char;
    });
  }
};
states.afterDOCTYPEName = {
  toString: function() { return 'afterDOCTYPEName'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        default:
          var nextSix = char + lexer.peek(5);
          
          if (/public/i.test(nextSix)) {
            lexer.getChars(5);
            lexer.setState('afterDOCTYPEPublicKeyword');
          } else if (/system/i.test(nextSix)) {
            lexer.getChars(5);
            lexer.setState('afterDOCTYPESystemKeyword');
          } else {
            lexer.errorState('bogusDOCTYPE');
            token.forceQuirks = true;
          }
          break;
      }
    });
  }
};
states.afterDOCTYPEPublicKeyword = {
  toString: function() { return 'afterDOCTYPEPublicKeyword'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          lexer.setState('beforeDOCTYPEPublicIdentifier');
          break;
        case QUOTE:
          lexer.errorState('DOCTYPEPublicIdentifierDoubleQuoted');
          token.publicIdentifier = "";
          break;
        case "'":
          lexer.errorState('DOCTYPEPublicIdentifierSingleQuoted');
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
          break;
      }
    });
  }
};
states.beforeDOCTYPEPublicIdentifier = {
  toString: function() { return 'beforeDOCTYPEPublicIdentifier'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          break;
        case QUOTE:
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
          break;
      }
    });
  }
};
states.DOCTYPEPublicIdentifierDoubleQuoted = {
  toString: function() { return 'DOCTYPEPublicIdentifierDoubleQuoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case QUOTE:
          lexer.setState('afterDOCTYPEPublicIdentifier');
          break;
        case NULL:
          lexer.parseError();
          token.publicIdentifier += REPLACEMENT;
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
          token.publicIdentifier += char;
          break;
      }
    });
  }
};
states.DOCTYPEPublicIdentifierSingleQuoted = {
  toString: function() { return 'DOCTYPEPublicIdentifierSingleQuoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case "'":
          lexer.setState('afterDOCTYPEPublicIdentifier');
          break;
        case NULL:
          lexer.parseError();
          token.publicIdentifier += REPLACEMENT;
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
          token.publicIdentifier += char;
          break;
      }
    });
  }
};
states.afterDOCTYPEPublicIdentifier = {
  toString: function() { return 'afterDOCTYPEPublicIdentifier'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          lexer.setState('betweenDOCTYPEPublicAndSystemIdentifier');
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case QUOTE:
          lexer.errorState('DOCTYPESystemIdentifierDoubleQuoted');
          token.systemIdentifier = "";
          break;
        case "'":
          lexer.errorState('DOCTYPESystemIdentifierSingleQuoted');
          token.systemIdentifier = "";
          break;
        case EOF:
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        default:
          lexer.setState('bogusDOCTYPE');
          token.forceQuirks = true;
          break;
      }
    });
  }
};
states.betweenDOCTYPEPublicAndSystemIdentifier = {
  toString: function() { return 'betweenDOCTYPEPublicAndSystemIdentifier'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case QUOTE:
          lexer.setState('DOCTYPESystemIdentifierDoubleQuoted');
          token.systemIdentifier = "";
          break;
        case "'":
          lexer.setState('DOCTYPESystemIdentifierSingleQuoted');
          token.systemIdentifier = "";
          break;
        case EOF:
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        default:
          lexer.errorState('bogusDOCTYPE');
          token.forceQuirks = true;
          break;
      }
    });
  }
};
states.afterDOCTYPESystemKeyword = {
  toString: function() { return 'afterDOCTYPESystemKeyword'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          lexer.setState('beforeDOCTYPESystemIdentifier');
          break;
        case QUOTE:
          lexer.errorState('DOCTYPESystemIdentifierDoubleQuoted');
          token.systemIdentifier = "";
          break;
        case "'":
          lexer.errorState('DOCTYPESystemIdentifierSingleQuoted');
          token.systemIdentifier = "";
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
          break;
      }
    });
  }
};
states.beforeDOCTYPESystemIdentifier = {
  toString: function() { return 'beforeDOCTYPESystemIdentifier'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          break;
        case QUOTE:
          lexer.setState('DOCTYPESystemIdentifierDoubleQuoted');
          token.systemIdentifier = "";
          break;
        case "'":
          lexer.setState('DOCTYPESystemIdentifierSingleQuoted');
          token.systemIdentifier = "";
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
          break;
      }
    });
  }
};
states.DOCTYPESystemIdentifierDoubleQuoted = {
  toString: function() { return 'DOCTYPESystemIdentifierDoubleQuoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case QUOTE:
          lexer.setState('afterDOCTYPESystemIdentifier');
          break;
        case NULL:
          lexer.parseError();
          token.systemIdentifier += REPLACEMENT;
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
          token.systemIdentifier += char;
          break;
      }
    });
  }
};
states.DOCTYPESystemIdentifierSingleQuoted = {
  toString: function() { return 'DOCTYPESystemIdentifierSingleQuoted'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case "'":
          lexer.setState('afterDOCTYPESystemIdentifier');
          break;
        case NULL:
          lexer.parseError();
          token.systemIdentifier += REPLACEMENT;
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
          token.systemIdentifier += char;
          break;
      }
    });
  }
};
states.afterDOCTYPESystemIdentifier = {
  toString: function() { return 'afterDOCTYPESystemIdentifier'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case SPACE:
          break;
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          token.forceQuirks = true;
          lexer.emitCurrentToken();
          break;
        default:
          lexer.errorState('bogusDOCTYPE');
          break;
      }
    });
  }
};
states.bogusDOCTYPE = {
  toString: function() { return 'bogusDOCTYPE'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case ">":
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
        case EOF:
          lexer.setState('data');
          lexer.emitCurrentToken();
          break;
      }
    });
  }
};
states.scriptDataLessThan = {
  toString: function() { return 'scriptDataLessThan'; },

  consume: function(lexer) {
    lexer.consume(function(char, token, tokens) {
      switch(char) {
        case "/":
          lexer.tmpBuffer = "";
          break;
        case "!":
          lexer.setState('scriptDataEscapeStart');
          lexer.pushToken(TkChar, "<");
          lexer.pushToken(TkChar, "!");
          break;
      }
    });
  }
};

var Tokenizer = function (input, strict){
  this.input = input;
  this.pos = 0;
  this.state = states.data;
  this.tokens = [];
  this.strict = strict || false;
  this.checked = [];
};

Tokenizer.prototype = {
  lex: function() {
    var length = this.input.length;
    while (this.pos <= length) {
      var before = this.input.slice(0, this.pos);
      var after = this.input.slice(this.pos);
      //console.log("Current state: " + this.state.toString() + " : {" + before + "} @ {" + after + "}");
      this.state.consume(this);
    }
  },

  parseError: function(toState) {
    if (this.strict) {
      var msg = "Parse Error in " + this.state.toString() + " going to ";
      msg += toState || this.state.toString();
      msg += " tokens so far: " + this.tokens.map(function(token) { return token.toTest(); });
      throw msg;
    } else {
      //console.log(this.state.toString() + " -> " + (toState || this.state.toString()));
      this.tokens.push(new TkError(this.state.toString(), toState || this.state.toString()));
    }
  },

  consume: function(callback) {
    var next = this.getChar();
    if (!this.checked[this.pos]) {
      this.assertValidChar(next.charCodeAt(0));
      this.checked[this.pos] = true;
    }

    callback(next, this.token, this.tokens);
  },

  setState: function(state) {
    this.state = states[state];
  },

  errorState: function(state) {
    this.parseError(state);
    this.setState(state);
  },

  setToken: function(TokenClass, param) {
    this.token = new TokenClass(param);
  },

  pushToken: function(TokenClass, param) {
    if (TokenClass instanceof Tk) {
      this.token = TokenClass;
    } else {
      this.token = new TokenClass(param);
    }

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
    this.token.finalize(this);
    this.tokens.push(this.token);
    this.token = null;
  },

  consumeCharacterReference: function(allowed) {
    var next = this.peek();
    if (next === undefined) { return; }

    switch (next) {
      case TAB:
      case LINEFEED:
      case FORMFEED:
      case SPACE:
      case "<":
      case "&":
      case EOF:
      case allowed:
        return;
      case "#":
        this.getChar();
        return this.consumeCharacterReferenceNumberSign();
      default:
        return this.consumeCharacterReferenceNamed();
    }
  },

  consumeCharacterReferenceNumberSign: function() {
    var next = this.peek();

    switch (next) {
      case "x":
      case "X":
        this.getChar();
        return this.consumeCharacterReferenceNumberPart(/[0-9A-Fa-f]/, 16);
      default:
        return this.consumeCharacterReferenceNumberPart(/[0-9]/, 10);
    }
  },

  consumeCharacterReferenceNumberPart: function(range, radix) {
    var next = this.peek(), out = "";

    if (!next || !range.test(next)) {
      this.reconsume();

      // if an "X" was provided, reconsume it
      if (radix === 16) { this.reconsume(); }

      this.parseError();
      return;
    }

    while (next && range.test(next)) {
      this.getChar();
      out += next;
      next = this.peek();
    }

    var final = this.peek();

    if (final === ";") {
      this.getChar();
    } else {
      this.parseError();
    }

    var number = parseInt(out, radix), char;

    if (number === 0) {
      this.parseError();
      return new TkChar(REPLACEMENT);
    } else if (number === 13) {
      this.parseError();
      return new TkChar(String.fromCharCode(13));
    } else if (number >= 128 && number <= 159) {
      this.parseError();
      return new TkChar(String.fromCharCode(ENTITIES.windows[number - 128]));
    } else if (number >= 0xD800 && number <= 0xDFFF || number > 0x10FFFF) {
      this.parseError();
      return new TkChar(REPLACEMENT);
    }

    this.assertValidUnicode(number);
    return new TkChar(String.fromCharCode(number));
  },

  assertValidChar: function(number) {
    //if (number === 0) {
      //this.parseError();
      //return;
    //}

    this.assertValidUnicode(number);
  },

  assertValidUnicode: function(number) {
    if ((number >= 0x0001 && number <= 0x0008) ||
        (number >= 0x000E && number <= 0x001F) ||
        (number >= 0x007F && number <= 0x009F) ||
        (number >= 0xFDD0 && number <= 0xFDEF)) {
      this.parseError();
    }

    switch (number) {
      case 0x000B:
      case 0xFFFE:
      case 0xFFFF:
      case 0x1FFFE:
      case 0x1FFFF:
      case 0x2FFFE:
      case 0x2FFFF:
      case 0x3FFFE:
      case 0x3FFFF:
      case 0x4FFFE:
      case 0x4FFFF:
      case 0x5FFFE:
      case 0x5FFFF:
      case 0x6FFFE:
      case 0x6FFFF:
      case 0x7FFFE:
      case 0x7FFFF:
      case 0x8FFFE:
      case 0x8FFFF:
      case 0x9FFFE:
      case 0x9FFFF:
      case 0xAFFFE:
      case 0xAFFFF:
      case 0xBFFFE:
      case 0xBFFFF:
      case 0xCFFFE:
      case 0xCFFFF:
      case 0xDFFFE:
      case 0xDFFFF:
      case 0xEFFFE:
      case 0xEFFFF:
      case 0xFFFFE:
      case 0xFFFFF:
      case 0x10FFFE:
      case 0x10FFFF:
        this.parseError();
    }
  },

  consumeCharacterReferenceNamed: function() {
    var chars = this.peek(9);

    for (var i=9; i>1; i--) {
      if (ENTITIES.named.hasOwnProperty(chars)) {
        if (chars.substr(-1) !== ";") { this.parseError(); }
        this.getChars(chars.length);

        return new TkChar(ENTITIES.named[chars]);
      }
      chars = chars.slice(0, -1);
    }

    this.parseError();
  }
};

exports.Tokenizer = Tokenizer;
//var input = "<div id='1' class=foo>hi</div><!-- hi --><p><!-- bye --></p><span style=zomg zomg>";
//var lexer = new Tokenizer(input);
//lexer.lex();

//console.log(lexer.tokens.map(function(token) { return token.toTest(); }));
