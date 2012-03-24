require "spec_helper"
require "json"
require "digest"

def load_test_data(file)
  test_data = File.expand_path("../testdata/tokenizer", __FILE__)
  JSON.parse(File.read(File.join(test_data, file)))
end

json = load_test_data("test1.test")

describe "test1" do
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

  json["tests"].each do |test_info|
    description = test_info["description"]
    input = test_info["input"]
    output = test_info["output"]

    digest = Digest::SHA1.hexdigest(input)

    it %{#{description} (processing "#{input}") - #{digest}} do
      pending if description =~ /doctype|entity/i

      expected = normalize_expected(output)
      @tokenizer.tokenize(input).should == expected
    end
  end
end

