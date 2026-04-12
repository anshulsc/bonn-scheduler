import Vision
import AppKit
import Foundation

func performOCR(imagePath: String) -> String {
    guard let image = NSImage(contentsOfFile: imagePath),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return "ERROR: Could not load image"
    }

    let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US", "de-DE"]

    do {
        try requestHandler.perform([request])
        guard let observations = request.results else {
            return ""
        }

        var fullText = ""
        for observation in observations {
            guard let topCandidate = observation.topCandidates(1).first else { continue }
            fullText += topCandidate.string + "\n"
        }
        return fullText
    } catch {
        return "ERROR: \(error)"
    }
}

// Ensure an arguments is passed
if CommandLine.arguments.count < 2 {
    print("Usage: swift ocr.swift <image_path>")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
print(performOCR(imagePath: imagePath))
