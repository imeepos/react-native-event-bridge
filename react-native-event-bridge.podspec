require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-event-bridge'
  s.version      = package['version']
  s.summary      = package['description']
  s.license      = package['license']
  s.source       = { :path => '.' }
  s.authors      = package['author'] || { 'react-native-event-bridge' => 'unknown' }

  s.platform     = :ios, '12.0'
  s.swift_version = '5.0'

  s.source_files = 'ios/**/*.{swift,m,h}'
  s.requires_arc = true

  s.dependency 'React-Core'
end
