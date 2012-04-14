require "v8"

class TokenizerTest
  def initialize
    @context = V8::Context.new
    @context['console'] = {
      "log" => lambda { |string| puts string },
      "inspect" => lambda { |string| p string },
      "dump" => lambda { |string| puts string.dump },
      "dumped" => lambda { |string| string.dump }
    }

    load_path = File.expand_path("../../lib", __FILE__)

    js_require = @context['require'] = lambda do |name|
      contents = File.read(File.join(load_path, name))
      @context.eval "(function(exports) { #{contents}; return exports; })({})", name
    end

    exports = js_require.call("parser.js")
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

