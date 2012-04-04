require "json"
require "./constants"

task :default do
  File.open("lib/entities.js", "w") do |file|
    file.puts "return {\n  named: {\n"

    out = []
    HTML5::ENTITIES.each do |entity, string|
      out << %{    #{entity.dup.force_encoding('UTF-8').to_json}: #{string.force_encoding('UTF-8').to_json}}
    end
    file.puts out.join(",\n")
    file.puts "  },\n"

    out = []
    file.puts "  windows: [\n"
    HTML5::ENTITIES_WINDOWS1252.each do |entity|
      out << %{    #{entity}}
    end
    file.puts out.join(",\n")
    file.puts "  ]\n"

    file.puts "}"
  end
end

