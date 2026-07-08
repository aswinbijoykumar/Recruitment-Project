import os
import fitz  # PyMuPDF


def extract_text_from_file(file_path):
    # Check if the file exists before attempting to open it
    if not os.path.exists(file_path):
        print(f"Error: The file '{file_path}' was not found.")
        return

    # Extract the file extension and convert it to lowercase
    _, file_extension = os.path.splitext(file_path)
    file_extension = file_extension.lower()

    try:


        # Condition 1: If the file is a TXT file
        if file_extension == ".txt":
            # Open and read the text file with UTF-8 encoding
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
                print(text)

        # Condition 2: If the file is a PDF file
        elif file_extension == ".pdf":
            # Open the PDF document using PyMuPDF
            doc = fitz.open(file_path)

            # Loop through each page in the PDF and extract text
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text()

                print(text)

        # Condition 3: Unsupported file formats
        else:
            print(f"Unsupported file format '{file_extension}'. This tool currently supports .pdf and .txt files.")
            return


    except Exception as e:
        print(f"An error occurred while reading the file: {e}")


if __name__ == "__main__":
    # You can now test this with both .pdf and .txt extensions
    resume_file_path = "../new resumes/Restructured_IT_Manager_Resume.pdf"
    # resume_file_path = "../new resumes/ATS_Cloud_Engineer_Resume.txt"

    extract_text_from_file(resume_file_path)





