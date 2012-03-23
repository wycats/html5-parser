var EOF = "";
var REPLACEMENT = "\ufffd";
var NULL = "\x00";

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

var TkChar = function(content) { this.content = content; };
TkChar.prototype = Object.create(Tk.prototype);
TkChar.prototype.name = "Character";
TkChar.prototype.toTest = function() {
  return [ "Character", this.content ];
};

var TkEOF = function() {};
TkEOF.prototype = Object.create(Tk.prototype);
TkEOF.prototype.name = "EOF";

var TkTag = function() {};
TkTag.prototype = Object.create(Tk.prototype);
TkTag.prototype.addChars = function(chars) {
  this.tagName += chars;
};

var TkStartTag = function(tagName) {
  this.tagName = tagName;
  this.attributes = {};
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
  return [ "StartTag", this.tagName, this.attributes ];
};

var TkEndTag = function(tagName) {
  this.tagName = tagName;
};
TkEndTag.prototype = Object.create(TkTag.prototype);
TkEndTag.prototype.name = "endTag";
TkEndTag.prototype.toTest = function() {
  return [ "EndTag", this.tagName ];
};

var TkComment = function() {
  this.body = "";
};
TkComment.prototype = Object.create(Tk.prototype);
TkComment.prototype.name = "comment";
TkComment.prototype.addChars = function(chars) {
  this.body += chars;
};
TkComment.prototype.toTest = function() {
  return [ "Comment", this.body ];
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
          lexer.pushCurrentToken();
          break;
        case EOF:
          lexer.setToken(TkEOF);
          lexer.pushCurrentToken();
          break;
        default:
          lexer.setToken(TkChar, next);
          lexer.pushCurrentToken();
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
        lexer.pos--;
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
      if (next === "\t" || next === "\n" || next === "\u000c" || next === " ") {
        lexer.setState('beforeAttributeName');
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.pushCurrentToken();
      } else if (/[A-Z]/.test(next)) {
        token.addChars(next.toLowerCase());
      } else if (next === NULL) {
        lexer.parseError();
        token.addChars(REPLACEMENT);
      } else if (next === EOF) {
        lexer.errorState('data');
        lexer.pos--;
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
          lexer.setToken(TkChar, "<");
          lexer.pushCurrentToken();
          lexer.setToken(TkChar, "!");
          lexer.pushCurrentToken();
          break;
        default:
          lexer.setState('scriptData');
          lexer.setToken(TkChar, "<");
          lexer.pushCurrentToken();
          lexer.pos--;
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
        lexer.setToken(TkChar, "<");
        lexer.pushCurrentToken();
        lexer.setToken(TkChar, "/");
        lexer.pushCurrentToken();
      }
    });
  }
};

states.scriptDataEndTagName = {
  toString: function() { return "scriptDataEndTagName"; },

  consume: function(lexer) {
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
      if (next === "\t" || next === "\n" || next === "\u000c" || next === " ") {
        // ignore
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.pushCurrentToken();
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
      if (next === "\t" || next === "\n" || next === "\u000c" || next === " ") {
        lexer.setState('afterAttributeName');
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === "=") {
        lexer.setState('beforeAttributeValue');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.pushCurrentToken();
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
      if (next === "\t" || next === "\n" || next === "\u000c" || next === " ") {
        // ignore
      } else if (next === "/") {
        lexer.setState('selfClosingStartTag');
      } else if (next === "=") {
        lexer.setState('beforeAttributeValue');
      } else if (next === ">") {
        lexer.setState('data');
        lexer.pushCurrentToken();
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
        case "\t":
        case "\n":
        case "\u000c":
        case " ":
          break;
        case "\"":
          lexer.setState('attributeValueDoubleQuoted');
          break;
        case "&":
          lexer.setState('attributeValueUnquoted');
          lexer.pos--;
          break;
        case "'":
          lexer.setState('attributeValueSingleQuoted');
          break;
        case NULL:
        case ">":
          lexer.errorState('data');
          lexer.pushCurrentToken();
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
          lexer.setState('beforeAttributeValue');
          break;
        case "&":
          // TODO: character reference in attribute value
          break;
        case ">":
          lexer.setState('data');
          lexer.pushCurrentToken();
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
          lexer.pushCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          break;
        default:
          lexer.errorState('beforeAttributeName');
          lexer.pos--;
      }
    });
  }
};

states.selfClosingStartTag = {
  toString: function() { return "selfClosingStartTag"; },

  consume: function(lexer) {
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
      lexer.setState('doctype');
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
          lexer.pushCurrentToken();
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
          lexer.pushCurrentToken();
          break;
        case EOF:
          lexer.errorState('data');
          lexer.pushCurrentToken();
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
          lexer.pushCurrentToken();
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
          lexer.pushCurrentToken();
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
          lexer.pushCurrentToken();
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
          lexer.pushCurrentToken();
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
          lexer.pushCurrentToken();
          break;
        case NULL:
          lexer.errorState('comment');
          token.addChars("--!");
          break;
        case EOF:
          lexer.errorState('data');
          lexer.pushCurrentToken();
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
  }
};

states.beforeDOCTYPE = {
  toString: function() { return "beforeDOCTYPE"; },

  consume: function(lexer) {
  }
};

states.DOCTYPEName = {
  toString: function() { return "DOCTYPEName"; },

  consume: function(lexer) {
  }
};

states.afterDOCTYPE = {
  toString: function() { return "afterDOCTYPE"; },

  consume: function(lexer) {
  }
};

states.afterDOCTYPEPublicKeyword = {
  toString: function() { return "afterDOCTYPEPublicKeyword"; },

  consume: function(lexer) {
  }
};

states.beforeDOCTYPEPublicIdentifier = {
  toString: function() { return "beforeDOCTYPEPublicIdentifier"; },

  consume: function(lexer) {
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

  getChar: function() {
    return this.input.charAt(this.pos++);
  },

  getChars: function(n) {
    return this.input.slice(this.pos, this.pos += n);
  },

  peek: function(n) {
    if (n) {
      return this.input.slice(this.pos, this.pos + n);
    } else {
      return this.input.charAt(this.pos);
    }
  },

  pushCurrentToken: function() {
    this.token.finalize();
    this.tokens.push(this.token);
    this.token = null;
  }
};

var input = "<div id='1' class=foo>hi</div><!-- hi --><p><!-- bye --></p><span style=zomg zomg>";
var lexer = new Tokenizer(input, true);
lexer.lex();

console.log(lexer.tokens.map(function(token) { return token.toTest(); }));
