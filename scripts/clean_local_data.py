"""Script to safely clean all generated local evidence, clips, and event databases.
Does NOT delete videos/, model weights, or source code.
"""
import os
import shutil
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_DATA_DIR = os.path.join(BASE_DIR, "local_data")

TARGET_SUBDIRS = ["evidence", "clips", "events"]

def clean_directory(dir_path: str):
    if not os.path.exists(dir_path):
        return
    for item in os.listdir(dir_path):
        if item == ".gitkeep":
            continue
        item_path = os.path.join(dir_path, item)
        try:
            if item.endswith(".db"):
                # If SQLite file is in use, clear its tables
                try:
                    conn = sqlite3.connect(item_path)
                    cur = conn.cursor()
                    cur.execute("DELETE FROM events")
                    conn.commit()
                    cur.execute("VACUUM")
                    conn.close()
                    print(f"  [Cleared] DB table records: {os.path.relpath(item_path, BASE_DIR)}")
                except Exception:
                    pass
                try:
                    os.unlink(item_path)
                    print(f"  [Removed] File: {os.path.relpath(item_path, BASE_DIR)}")
                except Exception:
                    pass
            elif os.path.isfile(item_path) or os.path.islink(item_path):
                os.unlink(item_path)
                print(f"  [Removed] File: {os.path.relpath(item_path, BASE_DIR)}")
            elif os.path.isdir(item_path):
                # Clean subfolder contents
                for sub in os.listdir(item_path):
                    if sub == ".gitkeep":
                        continue
                    sub_p = os.path.join(item_path, sub)
                    if os.path.isfile(sub_p):
                        os.unlink(sub_p)
                        print(f"  [Removed] File: {os.path.relpath(sub_p, BASE_DIR)}")
                    elif os.path.isdir(sub_p):
                        shutil.rmtree(sub_p)
                        print(f"  [Removed] Dir:  {os.path.relpath(sub_p, BASE_DIR)}")
        except Exception as e:
            print(f"  [Error] Could not remove {item_path}: {e}")

def main():
    print("=" * 60)
    print("CLEANING LOCAL ARTIFACTS IN local_data/")
    print("=" * 60)
    for sub in TARGET_SUBDIRS:
        target_path = os.path.join(LOCAL_DATA_DIR, sub)
        print(f"Cleaning: {os.path.relpath(target_path, BASE_DIR)}...")
        clean_directory(target_path)
    print("\n[OK] Local data successfully cleaned!")

if __name__ == "__main__":
    main()
