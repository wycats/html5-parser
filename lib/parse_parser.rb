require "strscan"
require "pp"

module HTML5
  class Visitor
    def initialize(sections)
      @sections = sections
    end
    
    def visit(node)
      send "visit_#{node.node_type}", node
    end
  end

  class EmittingVisitor < Visitor
    def emit
      out = ""

      @sections.each do |section|
        out += visit(section)
      end

      out
    end

    def visit_Section(section)
      section.rules.each do |rule|
        yield rule
      end
    end
  end

  class JavaScriptVisitor < EmittingVisitor
    def visit_Section(section)
      if raw?(section)
        raw_section(section)
      elsif case_rules?(section)
        case_section(section)
      else
        normal_section(section)
      end
    end

    def case_section(section)
      @case_section = true

      out  = "states.#{section.name} = {\n"
      out += "  toString: function() { return '#{section.name}'; },\n\n"

      out += "  consume: function(lexer) {\n"
      out += "    lexer.consume(function(char, token, tokens) {\n"
      out += "      switch(char) {\n"

      section.rules.each do |rule|
        out += visit rule
      end

      out += "      }\n"
      out += "    });\n"
      out += "  }\n"
      out += "};\n"

      out
    end

    def normal_section(section)
      @case_section = false

      out  = "states.#{section.name} = {\n"
      out += "  toString: function() { return '#{section.name}'; },\n\n"

      out += "  consume: function(lexer) {\n"
      out += "    lexer.consume(function(char, token, tokens) {\n"

      section.rules.each do |rule|
        out += visit rule
      end

      out += "    });\n"
      out += "  }\n"
      out += "};\n"
    end

    def raw_section(section)
      rule = section.rules.first

      if rule.transition == "last"
        transition = "lexer.lastState.toString()"
      elsif rule.transition
        transition = "'#{rule.transition}'"
      end

      out  = "states.#{section.name} = {\n"
      out += "  toString: function() { return '#{section.name}'; },\n\n"

      out += "  consume: function(lexer) {\n"
      out += "    lexer.setState(#{transition});\n" if transition
      out += action(rule.action_content, 4)
      out += "  }\n"
      out += "};\n"

      out
    end

    def visit_Rule(rule)
      return visit_case_Rule(rule) if @case_section
      visit_normal_Rule(rule)
    end

    def visit_normal_Rule(rule)
      case rule.type
      when :string, :regex
        desc = rule.value.inspect
      when :symbol
        desc = rule.value
      end

      out = ""

      if desc == "default"
        spaces = "      "
      elsif rule.type == :regex || rule.value == "ANYSPACE"
        out += "      if (#{desc}.test(char)) {\n"
        spaces = "        "
      else
        out += "      if (char === #{desc}) {\n"
        spaces = "        "
      end

      if rule.transition && rule.error
        out += "#{spaces}lexer.errorState('#{rule.transition}');\n"
      elsif rule.transition && rule.transition == "last"
        out += "#{spaces}lexer.setState(lexer.lastState.toString());\n"
      elsif rule.transition
        out += "#{spaces}lexer.setState('#{rule.transition}');\n"
      elsif rule.error
        out += "#{spaces}lexer.parseError();\n"
      end

      if rule.action_content
        out += action(rule.action_content, spaces.size)
      end

      unless desc == "default"
        out += "        return;\n"
        out += "      }\n"
      end

      out
    end

    def visit_case_Rule(rule)
      case rule.type
      when :string, :regex
        desc = rule.value.inspect
      when :symbol
        desc = rule.value
      end

      if desc == "default"
        out  = "        default:\n"
      else
        out  = "        case #{desc}:\n"
      end

      if rule.transition && rule.error
        out += "          lexer.errorState('#{rule.transition}');\n"
      elsif rule.transition
        out += "          lexer.setState('#{rule.transition}');\n"
      elsif rule.error
        out += "          lexer.parseError();\n"
      end

      if rule.action_content
        out += action(rule.action_content, 10)
      end

      out += "          break;\n"
    end

    def action(content, space)
      content = content.match(/\n(.*)\n[ ]*/m)[1]
      content = strip_leading_whitespace(content)
      content = content.split("\n").map { |line| (" " * space) + line + "\n" }.join
      content
    end

    def strip_leading_whitespace(content)
      indent = content.scan(/^[ \t]*(?=\S)/).min
      indent = indent ? indent.size : 0
      content.gsub(/^[ \t]{#{indent}}/, '')
    end

    def case_rules?(section)
      section.rules.all? do |rule|
        break false if rule.value == "ANYSPACE"
        rule.type == :string || rule.type == :symbol
      end
    end

    def raw?(section)
      return false unless section.rules.size == 1
      rule = section.rules.first
      return true if rule.type == :symbol && rule.value == "default"
      false
    end
  end

  class RoundtripVisitor < EmittingVisitor
    def visit_Section(section)
      out = "#{section.name} =\n"
      super { |rule| out << "  #{visit rule}\n" }
      "#{out}\n"
    end

    def visit_Rule(rule)
      case rule.type
      when :string, :regex
        out = rule.value.inspect
      when :symbol
        out = rule.value
      end

      out = "#{out} (error)" if rule.error
      out = "#{out} -> #{rule.transition}" if rule.transition

      if rule.action_content
        out = "#{out} {"
        out = "#{out}{" if rule.raw
        out = "#{out}#{rule.action_content}"
        out = "#{out}}" if rule.raw
        out = "#{out}}"
      end

      out
    end
  end

  class JSVisitor

  end

  class SectionNode
    attr_reader :name, :rules

    def initialize(name)
      @name = name
      @rules = []
    end

    def node_type
      "Section"
    end
  end

  class RuleNode
    attr_reader :type, :value, :error, :transition, :action_content, :raw

    def initialize(type, value)
      @type, @value = type, value
    end

    def node_type
      "Rule"
    end

    def transition_to(other)
      @transition = other
    end

    def action(action, raw)
      @action_content, @raw = action, raw
    end

    def error!
      @error = true
    end
  end

  class DefinitionParser
    attr_reader :ast

    def initialize(string)
      @string = string
      @scanner = StringScanner.new(string)
      @state = :root
      @ast = []
    end

    def parse
      until @scanner.eos?
        send "parse_#{@state}"
      end
    end

    def parse_root
      skip_whitespace

      pos = @scanner.pos

      @scanner.scan_until(/\s+=\n/)
      token = SectionNode.new(@scanner.pre_match[pos..-1])
      @ast << token
      @token = token.rules

      @state = :rule_match
    end

    def parse_rule_match
      @scanner.scan /\n/
      if @scanner.matched?
        @state = :root
        return
      end

      skip_spaces

      @scanner.scan /"[^"]"/
      if @scanner.matched?
        token = RuleNode.new(:string, @scanner.matched[1...-1])
      end

      unless token
        @scanner.scan /NULL|EOF|SPACE|ANYSPACE|QUOTE|default/
        if @scanner.matched?
          token = RuleNode.new(:symbol, @scanner.matched)
        end
      end

      unless token
        @scanner.scan %r{/[^/]+/}
        if @scanner.matched?
          token = RuleNode.new(:regex, Regexp.new(@scanner.matched[1...-1]))
        end
      end

      if token
        @rules = @token
        @token = token
        @rules << @token

        @state = :rule_definition
        return
      end

      parse_error "matching a rule"
    end

    def parse_rule_definition
      skip_spaces

      @scanner.scan /\(error\)/
      if @scanner.matched?
        @token.error!
        return
      end

      @scanner.scan /->/
      if @scanner.matched?
        @state = :transition_to
        return
      end

      @scanner.scan /\{/
      if @scanner.matched?
        @state = :action
        return
      end

      @scanner.scan /[ ]*\n/
      if @scanner.matched?
        @state = :rule_match
        @token = @rules
        return
      end

      parse_error "rule_definition"
    end

    def parse_transition_to
      skip_spaces

      @scanner.scan /[A-Za-z]+/

      if @scanner.matched?
        @token.transition_to @scanner.matched
        @state = :rule_definition
      else
        parse_error "Expected state to transition to"
      end
    end

    def parse_action
      skip_spaces

      tags = 0
      action = ""

      while true
        char = @scanner.getch
        break if tags == 0 && char == "}"

        tags += 1 if char == "{"
        tags -= 1 if char == "}"

        action << char
      end

      @scanner.scan /\n|$/
      unless @scanner.matched?
        parse_error "There must be a newline or EOF after an action block"
      end

      if action =~ /^\{(.*)\}$/m
        action = $1
        raw = true
      end

      @token.action action, !!raw

      @token = @rules
      @state = :rule_match
    end

    def skip_spaces
      @scanner.scan /[ ]*/
    end

    def skip_whitespace
      @scanner.scan /\s*/
    end

    def parse_error(msg)
      raise "#{@state}: #{msg}\n#{@scanner.inspect}\n#{@ast.inspect}"
    end
  end
end

file = File.expand_path("../machine.html5", __FILE__)
machine = File.read(file)
parser = HTML5::DefinitionParser.new(machine)
parser.parse
#puts HTML5::RoundtripVisitor.new(parser.ast).emit
puts HTML5::JavaScriptVisitor.new(parser.ast).emit
