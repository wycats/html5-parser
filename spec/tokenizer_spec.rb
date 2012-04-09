require "spec_helper"
require "json"
require "digest"
require "timeout"

def load_test_data(file)
  test_data = File.expand_path("../testdata/tokenizer", __FILE__)
  JSON.parse(File.read(File.join(test_data, file)))
end

%w(test1 test2 test3).each do |test|
  json = load_test_data("#{test}.test")

  describe test do
    before do
      @tokenizer = TokenizerTest.new
    end

    def normalize_expected(expected)
      normalized = []

      expected.each do |token|
        if token.is_a?(String)
          normalized << token
        elsif token.first == "Character"
          token.last.chars.each do |char|
            normalized << ["Character", char]
          end
        else
          normalized << token
        end
      end

      normalized
    end

    def normalize_actual(actual)
      normalized = []

      actual.each do |token|
        if token.is_a?(Array) && token.last.is_a?(Hash)
          token = token.dup
          attributes = token.last.dup

          attributes = attributes.inject({}) do |hash, (key, value)|
            hash.merge(key.to_s => value)
          end

          token.pop
          token.push attributes
        end

        normalized.push token
      end

      normalized
    end

    json["tests"].each do |test_info|
      description = test_info["description"]
      input = test_info["input"]
      output = test_info["output"]

      digest = Digest::SHA1.hexdigest(input)

      it %{#{description} (processing "#{input}") - #{digest}} do
        pending if description =~ /doctype/i
        pending if input.dump =~ /\\u\{[a-f0-9]{5,}\}/
        pending if test_info["pending"]

        expected = normalize_expected(output)

        Timeout.timeout(1) do
          actual = @tokenizer.tokenize(input)
          actual = normalize_actual(actual)

          actual.should == expected
        end
      end
    end
  end
end
