require "v8"

class TokenizerTest
  def initialize
    @context = V8::Context.new
    @context['console'] = { "log" => lambda { |string| puts string } }

    parser = File.expand_path("../../parser.js", __FILE__)
    exports = @context.eval "(function(exports) { #{File.read(parser)}; return exports; })({})", "parser.js"
    @tokenizer = exports['Tokenizer']
  end

  def tokenize(string)
    tokenizer = @tokenizer.new(string)
    tokenizer.lex
    tokens = tokenizer.tokens

    tokens.inject([]) do |arr, token|
      test_value = token.toTest

      next arr if test_value.is_a?(V8::Array) && test_value.first == "EOF"

      if test_value.is_a?(V8::Array)
        arr << test_value.map do |item|
          item = js_to_hash(item) if item.instance_of?(V8::Object)
          item
        end
      else
        arr << test_value
      end

      arr
    end
  end


  def js_to_hash(js)
    Hash[*js.to_a.flatten]
  end
end

